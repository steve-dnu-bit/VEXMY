import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonCorsHeaders, jsonResponse, requireCronAuth } from "../_shared/auth.ts";
import { getShopBrandingForBooking, type ShopBranding } from "../_shared/branding.ts";
import { resolveEmailLocale, t, type EmailLanguage } from "../_shared/email-i18n.ts";
import { requireEmailDeliveryConfig, sendTransactionalEmail } from "../_shared/email.ts";
import {
  buildAppointmentReminderEmail,
  buildDepositReminderEmail,
  type BookingEmailDetails,
} from "../_shared/email-templates.ts";
import {
  buildReminderDueWindows,
  fetchBookingsDueForReminders,
  timingToMs,
} from "../_shared/reminder-due-windows.ts";
import { loadShopReminderSettings, type ShopReminderSettingsRow } from "../_shared/shop-reminder-settings.ts";
import { isImportedContactPlaceholderBooking } from "../_shared/imported-contacts.ts";
import { loadChannelCredentials, sendTwilioMessage } from "../_shared/inbox-webhook.ts";
import { normalizeSmsE164 } from "../_shared/phone-normalize.ts";
import {
  buildAppointmentReminderSms,
  buildDepositReminderSms,
  isEmailReminderChannel,
  isSmsReminderChannel,
} from "../_shared/reminder-sms.ts";
import { formatBookingDateRange } from "../_shared/email.ts";
import { sendReminderPushNotification } from "../_shared/booking-push.ts";

const corsHeaders = jsonCorsHeaders;

/** Cap sends per cron tick to stay within Edge Function time limits. */
const MAX_SENDS_PER_RUN = 200;

type ReminderType = "appointment" | "deposit";

function isPiercingBooking(booking: { booking_type: string; service_category?: string | null }): boolean {
  const cat = (booking.service_category || "").toLowerCase();
  if (cat === "piercing") return true;
  const bt = (booking.booking_type || "").toLowerCase();
  return bt === "piercing-session" || bt.includes("piercing");
}

function normalizeSmsRecipient(phone: string | null | undefined): string | null {
  return normalizeSmsE164(phone);
}

async function orgCanSendSmsReminders(
  admin: ReturnType<typeof createClient>,
  organizationId: string | null | undefined,
): Promise<boolean> {
  if (!organizationId) return false;
  const { data: hasReminders } = await admin.rpc("org_plan_has_feature", {
    _org_id: organizationId,
    _feature: "reminders",
  });
  if (!hasReminders) return false;
  const creds = await loadChannelCredentials(admin, organizationId, "sms");
  return !!creds?.account_sid && !!creds?.auth_token && !!creds?.phone_number;
}

function settingsCacheKey(booking: { organization_id?: string | null; artist_id: string }): string {
  return `${booking.organization_id ?? ""}|${booking.artist_id}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronDenied = requireCronAuth(req);
  if (cronDenied) return cronDenied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const now = Date.now();
    const toleranceMs = 30 * 60 * 1000; // 30 minutes

    const dueWindows = buildReminderDueWindows(now, toleranceMs);
    const { data: bookings, error: bookingErr } = await fetchBookingsDueForReminders(admin, dueWindows);
    if (bookingErr) {
      return new Response(JSON.stringify({ error: bookingErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const artistIds = [...new Set((bookings || []).map((b) => b.artist_id))];
    const { data: artistProfiles } = artistIds.length
      ? await admin.from("profiles").select("user_id, display_name").in("user_id", artistIds)
      : { data: [] };
    const artistNameById = new Map<string, string>();
    for (const p of artistProfiles || []) {
      artistNameById.set(p.user_id, p.display_name || "Artist");
    }

    let sent = 0;
    let skipped = 0;
    let checked = 0;
    let failedCount = 0;
    let capped = false;
    const failures: Array<{ bookingId: string; reminderType: ReminderType; reminderTiming: string; recipient: string; error: string }> = [];

    const settingsCache = new Map<string, ShopReminderSettingsRow | null>();
    const getShopSettings = async (booking: {
      organization_id?: string | null;
      artist_id: string;
    }): Promise<ShopReminderSettingsRow | null> => {
      const key = settingsCacheKey(booking);
      if (settingsCache.has(key)) return settingsCache.get(key)!;
      const settings = await loadShopReminderSettings(admin, {
        organizationId: booking.organization_id ?? null,
        artistUserId: booking.artist_id,
      });
      settingsCache.set(key, settings);
      return settings;
    };

    const brandCache = new Map<string, ShopBranding>();
    const getOrgBrand = async (booking: {
      organization_id?: string | null;
      artist_id: string;
    }): Promise<ShopBranding> => {
      const key = settingsCacheKey(booking);
      const cached = brandCache.get(key);
      if (cached) return cached;
      const brand = await getShopBrandingForBooking(admin, {
        organizationId: booking.organization_id ?? null,
        artistId: booking.artist_id,
      });
      brandCache.set(key, brand);
      return brand;
    };

    const localeCache = new Map<string, EmailLanguage>();
    const getBookingLocale = async (booking: {
      organization_id?: string | null;
      client_user_id?: string | null;
    }): Promise<EmailLanguage> => {
      const key = `${booking.organization_id ?? ""}|${booking.client_user_id ?? ""}`;
      const cached = localeCache.get(key);
      if (cached) return cached;
      const resolved = await resolveEmailLocale(admin, {
        recipientUserId: booking.client_user_id ?? null,
        organizationId: booking.organization_id ?? null,
      });
      localeCache.set(key, resolved);
      return resolved;
    };

    const smsEnterpriseCache = new Map<string, boolean>();
    const smsCredsCache = new Map<string, Record<string, string> | null>();

    for (const booking of bookings || []) {
      if (sent >= MAX_SENDS_PER_RUN) {
        capped = true;
        break;
      }

      checked += 1;
      if (isImportedContactPlaceholderBooking(booking)) {
        skipped += 1;
        continue;
      }

      const shopSettings = await getShopSettings(booking);
      if (!shopSettings) {
        skipped += 1;
        continue;
      }
      const wantsEmail = isEmailReminderChannel(shopSettings.reminder_channel);
      const wantsSms = isSmsReminderChannel(shopSettings.reminder_channel);
      if (!wantsEmail && !wantsSms) {
        skipped += 1;
        continue;
      }
      if (!shopSettings.deposit_reminder && !shopSettings.appointment_reminder) {
        skipped += 1;
        continue;
      }

      const orgId = (booking.organization_id as string | null | undefined) ?? null;
      let smsAllowed = false;
      if (wantsSms && orgId) {
        if (!smsEnterpriseCache.has(orgId)) {
          smsEnterpriseCache.set(orgId, await orgCanSendSmsReminders(admin, orgId));
        }
        smsAllowed = smsEnterpriseCache.get(orgId) === true;
      }

      const clientEmail = typeof booking.client_email === "string" ? booking.client_email.trim() : "";
      const clientPhone = normalizeSmsRecipient(booking.client_phone as string | null | undefined);
      const canEmail = wantsEmail && !!clientEmail;
      const canSms = wantsSms && smsAllowed && !!clientPhone;
      if (!canEmail && !canSms) {
        skipped += 1;
        continue;
      }

      let smsCreds: Record<string, string> | null = null;
      if (canSms && orgId) {
        if (!smsCredsCache.has(orgId)) {
          smsCredsCache.set(orgId, await loadChannelCredentials(admin, orgId, "sms"));
        }
        smsCreds = smsCredsCache.get(orgId) ?? null;
        if (!smsCreds) {
          if (!canEmail) {
            skipped += 1;
            continue;
          }
        }
      }

      const startsAtMs = new Date(booking.starts_at as string).getTime();
      const candidates: Array<{ type: ReminderType; timing: string }> = [];
      if (shopSettings.appointment_reminder) {
        candidates.push({ type: "appointment", timing: shopSettings.appointment_reminder_timing });
      }
      if (
        shopSettings.deposit_reminder &&
        !booking.deposit_paid &&
        !booking.vip_client &&
        !isPiercingBooking(booking as { booking_type: string; service_category?: string | null }) &&
        booking.deposit_amount !== 0
      ) {
        candidates.push({ type: "deposit", timing: shopSettings.deposit_reminder_timing });
      }

      for (const candidate of candidates) {
        if (sent >= MAX_SENDS_PER_RUN) {
          capped = true;
          break;
        }

        const offsetMs = timingToMs(candidate.timing);
        if (!offsetMs) {
          skipped += 1;
          continue;
        }
        const dueAtMs = startsAtMs - offsetMs;
        if (Math.abs(now - dueAtMs) > toleranceMs) {
          skipped += 1;
          continue;
        }

        const locale = await getBookingLocale(booking as { organization_id?: string | null; client_user_id?: string | null });
        const brand = await getOrgBrand(booking as { organization_id?: string | null; artist_id: string });
        const bookingDetails: BookingEmailDetails = {
          id: booking.id as string,
          client_name: booking.client_name as string,
          client_email: clientEmail || null,
          client_phone: clientPhone,
          artistName: artistNameById.get(booking.artist_id as string) || "Artist",
          booking_type: booking.booking_type as string,
          service_category: booking.service_category as string | null | undefined,
          status: "confirmed",
          starts_at: booking.starts_at as string,
          ends_at: booking.ends_at as string,
          deposit_amount: booking.deposit_amount as number | null | undefined,
          deposit_paid: booking.deposit_paid as boolean | null | undefined,
        };

        const deliveryTargets: Array<{ channel: "email" | "sms"; recipient: string }> = [];
        if (canEmail) deliveryTargets.push({ channel: "email", recipient: clientEmail });
        if (canSms && smsCreds && clientPhone) deliveryTargets.push({ channel: "sms", recipient: clientPhone });

        for (const target of deliveryTargets) {
          if (sent >= MAX_SENDS_PER_RUN) {
            capped = true;
            break;
          }

          const { data: existing } = await admin
            .from("booking_reminder_events")
            .select("id")
            .eq("booking_id", booking.id)
            .eq("reminder_type", candidate.type)
            .eq("reminder_timing", candidate.timing)
            .eq("recipient_email", target.recipient)
            .maybeSingle();
          if (existing?.id) {
            skipped += 1;
            continue;
          }

          try {
            if (target.channel === "email") {
              requireEmailDeliveryConfig();
              const subject =
                candidate.type === "deposit"
                  ? t(locale, "subjects.reminders.deposit", { shopName: brand.shopName })
                  : t(locale, "subjects.reminders.appointment", { shopName: brand.shopName });
              const built =
                candidate.type === "deposit"
                  ? buildDepositReminderEmail(bookingDetails, undefined, locale, brand)
                  : buildAppointmentReminderEmail(bookingDetails, locale, brand);
              await sendTransactionalEmail({
                to: target.recipient,
                subject,
                html: built.html,
                attachments: built.attachments,
                fromKind: "booking",
                fromDisplayName: brand.shopName,
                replyTo: brand.supportEmail ?? undefined,
              });
            } else {
              const smsBody =
                candidate.type === "deposit"
                  ? buildDepositReminderSms(bookingDetails, locale, brand)
                  : buildAppointmentReminderSms(bookingDetails, locale, brand);
              await sendTwilioMessage(smsCreds!, target.recipient, smsBody, false);
            }

            sent += 1;
            await admin.from("booking_reminder_events").insert({
              booking_id: booking.id,
              reminder_type: candidate.type,
              reminder_timing: candidate.timing,
              recipient_email: target.recipient,
              status: "sent",
            } as any);

            const clientUserId = (booking.client_user_id as string | null | undefined) ?? null;
            if (clientUserId) {
              const pushRecipient = `push:${clientUserId}`;
              const { data: existingPush } = await admin
                .from("booking_reminder_events")
                .select("id")
                .eq("booking_id", booking.id)
                .eq("reminder_type", candidate.type)
                .eq("reminder_timing", candidate.timing)
                .eq("recipient_email", pushRecipient)
                .maybeSingle();

              if (!existingPush?.id) {
                const whenLabel = formatBookingDateRange(
                  booking.starts_at as string,
                  booking.ends_at as string,
                  locale,
                );
                const pushResult = await sendReminderPushNotification(admin, {
                  userId: clientUserId,
                  reminderType: candidate.type,
                  shopName: brand.shopName,
                  whenLabel,
                  bookingId: booking.id as string,
                });
                if (pushResult.sent > 0) {
                  await admin.from("booking_reminder_events").insert({
                    booking_id: booking.id,
                    reminder_type: candidate.type,
                    reminder_timing: candidate.timing,
                    recipient_email: pushRecipient,
                    status: "sent",
                  } as any);
                }
              }
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : "Unknown reminder send error";
            failedCount += 1;
            failures.push({
              bookingId: booking.id as string,
              reminderType: candidate.type,
              reminderTiming: candidate.timing,
              recipient: target.recipient,
              error: message,
            });
            await admin.from("booking_reminder_events").insert({
              booking_id: booking.id,
              reminder_type: candidate.type,
              reminder_timing: candidate.timing,
              recipient_email: target.recipient,
              status: "failed",
              error_message: message,
            } as any);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: failedCount === 0, checked, sent, skipped, failedCount, capped, failures }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

function settingsCacheKey(booking: { organization_id?: string | null; artist_id: string }): string {
  return `${booking.organization_id ?? ""}|${booking.artist_id}`;
}

function isEmailReminderChannel(settings: ShopReminderSettingsRow): boolean {
  return settings.reminder_channel === "email" || settings.reminder_channel === "both";
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

    requireEmailDeliveryConfig();

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
    const failures: Array<{ bookingId: string; reminderType: ReminderType; reminderTiming: string; recipientEmail: string; error: string }> = [];

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
      if (!booking.client_email) {
        skipped += 1;
        continue;
      }

      const shopSettings = await getShopSettings(booking);
      if (!shopSettings || !isEmailReminderChannel(shopSettings)) {
        skipped += 1;
        continue;
      }
      if (!shopSettings.deposit_reminder && !shopSettings.appointment_reminder) {
        skipped += 1;
        continue;
      }

      const startsAtMs = new Date(booking.starts_at).getTime();
      const candidates: Array<{ type: ReminderType; timing: string }> = [];
      if (shopSettings.appointment_reminder) {
        candidates.push({ type: "appointment", timing: shopSettings.appointment_reminder_timing });
      }
      if (shopSettings.deposit_reminder && !booking.deposit_paid && !isPiercingBooking(booking) && booking.deposit_amount !== 0) {
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

        const { data: existing } = await admin
          .from("booking_reminder_events")
          .select("id")
          .eq("booking_id", booking.id)
          .eq("reminder_type", candidate.type)
          .eq("reminder_timing", candidate.timing)
          .eq("recipient_email", booking.client_email)
          .maybeSingle();
        if (existing?.id) {
          skipped += 1;
          continue;
        }

        const locale = await getBookingLocale(booking);
        const brand = await getOrgBrand(booking);
        const subject =
          candidate.type === "deposit"
            ? t(locale, "subjects.reminders.deposit", { shopName: brand.shopName })
            : t(locale, "subjects.reminders.appointment", { shopName: brand.shopName });

        const bookingDetails: BookingEmailDetails = {
          id: booking.id,
          client_name: booking.client_name,
          client_email: booking.client_email,
          client_phone: null,
          artistName: artistNameById.get(booking.artist_id) || "Artist",
          booking_type: booking.booking_type,
          service_category: booking.service_category,
          status: "confirmed",
          starts_at: booking.starts_at,
          ends_at: booking.ends_at,
          deposit_amount: booking.deposit_amount,
          deposit_paid: booking.deposit_paid,
        };

        const built =
          candidate.type === "deposit"
            ? buildDepositReminderEmail(bookingDetails, undefined, locale, brand)
            : buildAppointmentReminderEmail(bookingDetails, locale, brand);

        try {
          await sendTransactionalEmail({
            to: booking.client_email,
            subject,
            html: built.html,
            attachments: built.attachments,
            fromKind: "booking",
            fromDisplayName: brand.shopName,
            replyTo: brand.supportEmail ?? undefined,
          });
          sent += 1;
          await admin.from("booking_reminder_events").insert({
            booking_id: booking.id,
            reminder_type: candidate.type,
            reminder_timing: candidate.timing,
            recipient_email: booking.client_email,
            status: "sent",
          } as any);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Unknown reminder send error";
          failedCount += 1;
          failures.push({
            bookingId: booking.id,
            reminderType: candidate.type,
            reminderTiming: candidate.timing,
            recipientEmail: booking.client_email,
            error: message,
          });
          await admin.from("booking_reminder_events").insert({
            booking_id: booking.id,
            reminder_type: candidate.type,
            reminder_timing: candidate.timing,
            recipient_email: booking.client_email,
            status: "failed",
            error_message: message,
          } as any);
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

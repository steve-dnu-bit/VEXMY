import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonCorsHeaders, jsonResponse, requireCronAuth } from "../_shared/auth.ts";
import { getShopBranding } from "../_shared/branding.ts";
import { requireSmtpConfig, sendTransactionalEmail } from "../_shared/email.ts";
import {
  buildAppointmentReminderEmail,
  buildDepositReminderEmail,
  type BookingEmailDetails,
} from "../_shared/email-templates.ts";

const corsHeaders = jsonCorsHeaders;

type ReminderType = "appointment" | "deposit";

type ReminderSettingsRow = {
  user_id: string;
  deposit_reminder: boolean;
  appointment_reminder: boolean;
  deposit_reminder_timing: string;
  appointment_reminder_timing: string;
  reminder_channel: string;
};

function timingToMs(value: string): number | null {
  switch (value) {
    case "1h":
      return 1 * 60 * 60 * 1000;
    case "3h":
      return 3 * 60 * 60 * 1000;
    case "12h":
      return 12 * 60 * 60 * 1000;
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "48h":
      return 48 * 60 * 60 * 1000;
    case "72h":
      return 72 * 60 * 60 * 1000;
    case "1w":
      return 7 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function isPiercingBooking(booking: { booking_type: string; service_category?: string | null }): boolean {
  const cat = (booking.service_category || "").toLowerCase();
  if (cat === "piercing") return true;
  const bt = (booking.booking_type || "").toLowerCase();
  return bt === "piercing-session" || bt.includes("piercing");
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

    const smtp = requireSmtpConfig();

    const admin = createClient(supabaseUrl, serviceKey);
    const now = Date.now();
    const toleranceMs = 30 * 60 * 1000; // 30 minutes
    const horizon = new Date(now + 8 * 24 * 60 * 60 * 1000).toISOString();

    const { data: settingsRows, error: settingsErr } = await admin
      .from("reminder_settings")
      .select("user_id, deposit_reminder, appointment_reminder, deposit_reminder_timing, appointment_reminder_timing, reminder_channel")
      .or("deposit_reminder.eq.true,appointment_reminder.eq.true");
    if (settingsErr) {
      return new Response(JSON.stringify({ error: settingsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const settingsByArtist = new Map<string, ReminderSettingsRow>();
    for (const row of (settingsRows || []) as ReminderSettingsRow[]) {
      settingsByArtist.set(row.user_id, row);
    }
    if (settingsByArtist.size === 0) {
      return new Response(JSON.stringify({ ok: true, checked: 0, sent: 0, skipped: 0, failedCount: 0, failures: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const artistIds = [...settingsByArtist.keys()];
    const { data: artistProfiles } = await admin.from("profiles").select("user_id, display_name").in("user_id", artistIds);
    const artistNameById = new Map<string, string>();
    for (const p of artistProfiles || []) {
      artistNameById.set(p.user_id, p.display_name || "Artist");
    }

    const { data: bookings, error: bookingErr } = await admin
      .from("bookings")
      .select("id, artist_id, client_name, client_email, starts_at, ends_at, booking_type, service_category, deposit_paid, deposit_amount")
      .in("artist_id", artistIds)
      .gte("starts_at", new Date(now).toISOString())
      .lte("starts_at", horizon)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true });
    if (bookingErr) {
      return new Response(JSON.stringify({ error: bookingErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    let skipped = 0;
    let checked = 0;
    let failedCount = 0;
    const failures: Array<{ bookingId: string; reminderType: ReminderType; reminderTiming: string; recipientEmail: string; error: string }> = [];

    const brand = getShopBranding();

    for (const booking of bookings || []) {
      checked += 1;
      const settings = settingsByArtist.get(booking.artist_id);
      if (!settings) {
        skipped += 1;
        continue;
      }
      if (settings.reminder_channel === "sms") {
        skipped += 1;
        continue;
      }
      if (!booking.client_email) {
        skipped += 1;
        continue;
      }

      const startsAtMs = new Date(booking.starts_at).getTime();
      const candidates: Array<{ type: ReminderType; timing: string }> = [];
      if (settings.appointment_reminder) {
        candidates.push({ type: "appointment", timing: settings.appointment_reminder_timing });
      }
      if (settings.deposit_reminder && !booking.deposit_paid && !isPiercingBooking(booking)) {
        candidates.push({ type: "deposit", timing: settings.deposit_reminder_timing });
      }

      for (const candidate of candidates) {
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

        const subject =
          candidate.type === "deposit"
            ? `Deposit reminder — ${brand.shopName}`
            : `Appointment reminder — ${brand.shopName}`;

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
            ? buildDepositReminderEmail(bookingDetails)
            : buildAppointmentReminderEmail(bookingDetails);

        try {
          await sendTransactionalEmail({
            smtp,
            to: booking.client_email,
            subject,
            html: built.html,
            attachments: built.attachments,
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

    return new Response(JSON.stringify({ ok: failedCount === 0, checked, sent, skipped, failedCount, failures }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

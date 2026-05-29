import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import nodemailer from "npm:nodemailer@6.9.15";
import { jsonCorsHeaders, jsonResponse, requireCronAuth } from "../_shared/auth.ts";
import { emailBrandHeaderLarge, getShopBranding } from "../_shared/branding.ts";

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

function fmtBookingWindow(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
  const startTime = start.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  const endTime = end.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  return `${date}, ${startTime} - ${endTime}`;
}

async function sendMail(params: {
  host: string | null;
  port: string | null;
  username: string | null;
  password: string | null;
  from: string | null;
  to: string;
  subject: string;
  html: string;
}) {
  const { host, port, username, password, from, to, subject, html } = params;
  if (!host || !port || !username || !password || !from) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM.");
  }
  const portNum = Number(port);
  if (!Number.isFinite(portNum)) throw new Error("SMTP_PORT must be a number.");
  const transporter = nodemailer.createTransport({
    host,
    port: portNum,
    secure: portNum === 465,
    auth: { user: username, pass: password },
    requireTLS: portNum !== 465,
  });
  await transporter.sendMail({ from, to, subject, html });
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

    const smtpHost = Deno.env.get("SMTP_HOST") ?? null;
    const smtpPort = Deno.env.get("SMTP_PORT") ?? null;
    const smtpUser = Deno.env.get("SMTP_USER") ?? null;
    const smtpPass = Deno.env.get("SMTP_PASS") ?? Deno.env.get("SMTP_PASSWORD") ?? null;
    const emailFrom = Deno.env.get("EMAIL_FROM") ?? Deno.env.get("SMTP_FROM") ?? null;

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
        const body =
          candidate.type === "deposit"
            ? `Your booking is coming up (${fmtBookingWindow(booking.starts_at, booking.ends_at)}). Please complete your deposit to secure your session.`
            : `Just a reminder for your upcoming booking: ${fmtBookingWindow(booking.starts_at, booking.ends_at)}.`;
        const html = `
          <div style="margin:0;background:#0b0b0d;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#ececec;">
            <div style="max-width:640px;margin:0 auto;background:#121216;border:1px solid #222;border-radius:14px;overflow:hidden;">
              <div style="padding:20px 24px;background:#141419;text-align:center;">
                ${emailBrandHeaderLarge(brand)}
                <div style="margin-top:6px;font-size:12px;color:#c7c7c7;">${candidate.type === "deposit" ? "Deposit Reminder" : "Appointment Reminder"}</div>
              </div>
              <div style="padding:22px;">
                <p style="margin:0 0 10px;">Hi ${booking.client_name},</p>
                <p style="margin:0 0 14px;line-height:1.6;color:#d7d7d7;">${body}</p>
                <div style="border:1px solid #2a2a2e;background:#0d0d11;border-radius:10px;padding:12px 14px;">
                  <p style="margin:0 0 8px;"><strong>Booking type:</strong> ${booking.booking_type}</p>
                  <p style="margin:0;"><strong>Date & time:</strong> ${fmtBookingWindow(booking.starts_at, booking.ends_at)}</p>
                </div>
              </div>
            </div>
          </div>`;

        try {
          await sendMail({
            host: smtpHost,
            port: smtpPort,
            username: smtpUser,
            password: smtpPass,
            from: emailFrom,
            to: booking.client_email,
            subject,
            html,
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

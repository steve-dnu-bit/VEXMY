import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import nodemailer from "npm:nodemailer@6.9.15";
import {
  callerHasStaffAccess,
  jsonCorsHeaders,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/auth.ts";
import { emailBrandHeaderLarge, getShopBranding } from "../_shared/branding.ts";

const corsHeaders = jsonCorsHeaders;

type BookingNotificationAction = "created" | "updated" | "deleted";

type BookingPayload = {
  id: string;
  artist_id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  booking_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
};

type RecipientInfo = { role: "artist" | "customer"; name: string };

function isValidEmail(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function trySendEmail(params: {
  host: string | null;
  port: string | null;
  username: string | null;
  password: string | null;
  from: string | null;
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
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

function formatDateRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const datePart = start.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
  const startTime = start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const endTime = end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return `${datePart}, ${startTime} - ${endTime}`;
}

function safe(value: string | null | undefined): string {
  if (!value) return "N/A";
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildBookingHtml(params: {
  action: BookingNotificationAction;
  recipientName: string;
  artistName: string;
  booking: BookingPayload;
}): string {
  const { action, recipientName, artistName, booking } = params;
  const title =
    action === "created"
      ? "Booking Confirmed"
      : action === "updated"
        ? "Booking Updated"
        : "Booking Cancelled";
  const subtitle =
    action === "created"
      ? "A booking was created with the details below."
      : action === "updated"
        ? "A booking was updated. Please review the latest details below."
        : "A booking was deleted. Please review the details below.";

  const bookingType = booking.booking_type ? booking.booking_type.charAt(0).toUpperCase() + booking.booking_type.slice(1) : "Session";

  const brand = getShopBranding();
  return `
    <div style="margin:0;background:#0b0b0d;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#ececec;">
      <div style="max-width:700px;margin:0 auto;background:#121216;border:1px solid #222;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.35);">
        <div style="padding:20px 24px;background:linear-gradient(180deg,#1a1a1f,#101014);text-align:center;">
          ${emailBrandHeaderLarge(brand)}
          <div style="margin-top:6px;font-size:12px;letter-spacing:.3px;color:#c7c7c7;">Booking Notification</div>
        </div>

        <div style="padding:24px;">
          <h2 style="margin:0 0 10px;font-size:24px;color:#f4c24d;">${title}</h2>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#d7d7d7;">
            Hi ${safe(recipientName)},<br/>${subtitle}
          </p>

          <div style="border:1px solid #2a2a2e;background:#0d0d11;border-radius:10px;padding:14px 16px;">
            <div style="display:flex;justify-content:space-between;font-size:14px;padding:8px 0;border-bottom:1px solid #222;">
              <span style="color:#9f9f9f;">Client:</span><strong>${safe(booking.client_name)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:14px;padding:8px 0;border-bottom:1px solid #222;">
              <span style="color:#9f9f9f;">Artist:</span><strong>${safe(artistName)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:14px;padding:8px 0;border-bottom:1px solid #222;">
              <span style="color:#9f9f9f;">Date & time:</span><strong>${safe(formatDateRange(booking.starts_at, booking.ends_at))}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:14px;padding:8px 0;border-bottom:1px solid #222;">
              <span style="color:#9f9f9f;">Booking type:</span><strong>${safe(bookingType)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:14px;padding:8px 0;border-bottom:1px solid #222;">
              <span style="color:#9f9f9f;">Status:</span><strong>${safe(booking.status || "confirmed")}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:14px;padding:8px 0;border-bottom:1px solid #222;">
              <span style="color:#9f9f9f;">Customer email:</span><strong>${safe(booking.client_email)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:14px;padding:8px 0;border-bottom:1px solid #222;">
              <span style="color:#9f9f9f;">Customer phone:</span><strong>${safe(booking.client_phone)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:14px;padding:8px 0;">
              <span style="color:#9f9f9f;">Booking ID:</span><strong>${safe(booking.id)}</strong>
            </div>
          </div>

          ${
            booking.notes
              ? `<div style="margin-top:12px;border:1px solid #2a2a2e;background:#0d0d11;border-radius:10px;padding:12px 14px;">
              <p style="margin:0 0 6px;font-size:12px;color:#9f9f9f;">Notes</p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#e5e5e5;">${safe(booking.notes)}</p>
            </div>`
              : ""
          }

          <p style="margin:14px 0 0;font-size:12px;color:#9f9f9f;">
            This is an automated ${brand.shopName} notification.
          </p>
        </div>
      </div>
    </div>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const authResult = await requireAuthenticatedUser(adminClient, req);
    if ("status" in authResult) {
      return jsonResponse(authResult.body, authResult.status);
    }
    const canNotify = await callerHasStaffAccess(adminClient, authResult.user.id);
    if (!canNotify) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action =
      body.action === "deleted" ? "deleted" : body.action === "updated" ? "updated" : body.action === "created" ? "created" : null;
    const bookingPayload = (body.booking ?? null) as BookingPayload | null;
    if (!action || !bookingPayload?.id) {
      return jsonResponse({ error: "Invalid payload. action and booking.id are required." }, 400);
    }

    const { data: bookingRow, error: bookingLoadErr } = await adminClient
      .from("bookings")
      .select(
        "id, artist_id, client_name, client_email, client_phone, booking_type, status, starts_at, ends_at, notes",
      )
      .eq("id", bookingPayload.id)
      .single();
    if (bookingLoadErr || !bookingRow) {
      return jsonResponse({ error: bookingLoadErr?.message ?? "Booking not found" }, 404);
    }
    const booking = bookingRow as BookingPayload;

    const smtpHost = Deno.env.get("SMTP_HOST") ?? null;
    const smtpPort = Deno.env.get("SMTP_PORT") ?? null;
    const smtpUser = Deno.env.get("SMTP_USER") ?? null;
    const smtpPass = Deno.env.get("SMTP_PASS") ?? Deno.env.get("SMTP_PASSWORD") ?? null;
    const emailFrom = Deno.env.get("EMAIL_FROM") ?? Deno.env.get("SMTP_FROM") ?? null;

    const [artistUserRes, artistProfileRes] = await Promise.all([
      adminClient.auth.admin.getUserById(booking.artist_id),
      adminClient.from("profiles").select("display_name").eq("user_id", booking.artist_id).maybeSingle(),
    ]);

    const { data: reminderSettings } = await adminClient
      .from("reminder_settings")
      .select("booking_confirmation")
      .eq("user_id", booking.artist_id)
      .maybeSingle();
    const bookingConfirmationEnabled = !!reminderSettings?.booking_confirmation;
    if (action === "created" && !bookingConfirmationEnabled) {
      return new Response(JSON.stringify({ ok: true, emailAttempted: false, attempted: 0, sent: 0, failedCount: 0, skipped: "booking_confirmation_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const artistEmailRaw = artistUserRes.data.user?.email?.toLowerCase() ?? null;
    const artistName = artistProfileRes.data?.display_name || "Artist";
    const customerEmailRaw = booking.client_email?.toLowerCase() ?? null;

    const recipients = new Map<string, RecipientInfo>();
    if (isValidEmail(artistEmailRaw)) recipients.set(artistEmailRaw, { role: "artist", name: artistName });
    if (isValidEmail(customerEmailRaw)) recipients.set(customerEmailRaw, { role: "customer", name: booking.client_name || "Customer" });

    const brand = getShopBranding();
    const baseSubject =
      action === "created"
        ? `Booking Confirmed — ${brand.shopName}`
        : action === "updated"
          ? `Booking Updated — ${brand.shopName}`
          : `Booking Cancelled — ${brand.shopName}`;
    const sendJobs = [...recipients.entries()].map(async ([email, recipient]) => {
      const subject =
        action === "created"
          ? recipient.role === "artist"
            ? `New Booking Added — ${brand.shopName}`
            : baseSubject
          : action === "updated"
            ? recipient.role === "artist"
              ? `Booking Updated — ${brand.shopName}`
              : baseSubject
            : recipient.role === "artist"
              ? `Booking Removed — ${brand.shopName}`
              : baseSubject;

      try {
        await trySendEmail({
          host: smtpHost,
          port: smtpPort,
          username: smtpUser,
          password: smtpPass,
          from: emailFrom,
          to: email,
          subject,
          html: buildBookingHtml({
            action,
            recipientName: recipient.name,
            artistName,
            booking,
          }),
        });
        return { ok: true, email, role: recipient.role, subject };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown email send error";
        console.error("Booking notification send failed", { email, message });
        return { ok: false, email, role: recipient.role, subject, message };
      }
    });

    if (sendJobs.length === 0) {
      return new Response(JSON.stringify({ ok: true, emailAttempted: false, attempted: 0, sent: 0, failedCount: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await Promise.all(sendJobs);
    const attempted = results.length;
    const sent = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    const failedCount = failed.length;

    const auditRows = results.map((r) => ({
      booking_id: booking.id,
      action,
      recipient_role: r.role,
      recipient_email: r.email,
      subject: r.subject,
      status: r.ok ? "sent" : "failed",
      error_message: r.ok ? null : r.message || "Unknown send error",
      sent_at: new Date().toISOString(),
    }));

    if (auditRows.length > 0) {
      const { error: auditErr } = await adminClient.from("booking_notification_events").insert(auditRows as any);
      if (auditErr) {
        console.error("Failed to write booking notification audit rows:", auditErr.message);
      }
    }

    return new Response(JSON.stringify({ ok: failedCount === 0, emailAttempted: true, attempted, sent, failedCount, failed }), {
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

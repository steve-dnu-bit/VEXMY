import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  callerHasStaffAccess,
  jsonCorsHeaders,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/auth.ts";
import { getShopBranding } from "../_shared/branding.ts";
import { requireSmtpConfig, sendTransactionalEmail } from "../_shared/email.ts";
import { buildBookingNotificationEmail, type BookingEmailDetails } from "../_shared/email-templates.ts";

const corsHeaders = jsonCorsHeaders;

type BookingNotificationAction = "created" | "updated" | "deleted";

type BookingPayload = {
  id: string;
  artist_id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  booking_type: string;
  service_category?: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  tattoo_style?: string | null;
  tattoo_size?: string | null;
  tattoo_placement?: string | null;
  deposit_amount?: number | null;
  deposit_paid?: boolean | null;
};

type RecipientInfo = { role: "artist" | "customer"; name: string };

function isValidEmail(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
        "id, artist_id, client_name, client_email, client_phone, booking_type, service_category, status, starts_at, ends_at, notes, tattoo_style, tattoo_size, tattoo_placement, deposit_amount, deposit_paid",
      )
      .eq("id", bookingPayload.id)
      .single();
    if (bookingLoadErr || !bookingRow) {
      return jsonResponse({ error: bookingLoadErr?.message ?? "Booking not found" }, 404);
    }
    const booking = bookingRow as BookingPayload;

    let smtp;
    try {
      smtp = requireSmtpConfig();
    } catch (smtpErr) {
      const message = smtpErr instanceof Error ? smtpErr.message : "SMTP not configured";
      return jsonResponse({ ok: false, emailAttempted: false, error: message, hint: "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM in Supabase Edge Function secrets." }, 503);
    }

    const [artistUserRes, artistProfileRes] = await Promise.all([
      adminClient.auth.admin.getUserById(booking.artist_id),
      adminClient.from("profiles").select("display_name").eq("user_id", booking.artist_id).maybeSingle(),
    ]);

    const { data: reminderSettings } = await adminClient
      .from("reminder_settings")
      .select("booking_confirmation")
      .eq("user_id", booking.artist_id)
      .maybeSingle();
    const bookingConfirmationEnabled = reminderSettings?.booking_confirmation ?? true;
    if (action === "created" && bookingConfirmationEnabled === false) {
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
        ? `Booking confirmed — ${brand.shopName}`
        : action === "updated"
          ? `Booking updated — ${brand.shopName}`
          : `Booking cancelled — ${brand.shopName}`;

    const bookingDetails: BookingEmailDetails = {
      ...booking,
      artistName,
      artistEmail: artistEmailRaw,
    };

    const sendJobs = [...recipients.entries()].map(async ([email, recipient]) => {
      const subject =
        action === "created"
          ? recipient.role === "artist"
            ? `New booking — ${brand.shopName}`
            : baseSubject
          : action === "updated"
            ? recipient.role === "artist"
              ? `Booking updated — ${brand.shopName}`
              : baseSubject
            : recipient.role === "artist"
              ? `Booking removed — ${brand.shopName}`
              : baseSubject;

      try {
        const { html, attachments } = buildBookingNotificationEmail({
          action,
          recipientName: recipient.name,
          booking: bookingDetails,
          includeCalendarHint: recipient.role === "customer" || action !== "deleted",
        });

        await sendTransactionalEmail({
          smtp,
          to: email,
          subject,
          html,
          attachments,
        });
        return { ok: true, email, role: recipient.role, subject };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown email send error";
        console.error("Booking notification send failed", { email, message });
        return { ok: false, email, role: recipient.role, subject, message };
      }
    });

    if (sendJobs.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        emailAttempted: false,
        attempted: 0,
        sent: 0,
        failedCount: 0,
        skipped: !isValidEmail(customerEmailRaw) && !isValidEmail(artistEmailRaw) ? "no_valid_recipient_email" : "no_recipients",
      }), {
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

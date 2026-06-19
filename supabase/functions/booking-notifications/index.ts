import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  callerHasStaffAccess,
  callerIsOrgMember,
  isCronAuthorized,
  jsonCorsHeaders,
  jsonResponse,
  parseBearerToken,
  requireAuthenticatedUser,
} from "../_shared/auth.ts";
import { getShopBranding } from "../_shared/branding.ts";
import { resolveEmailLocale, t, type EmailLanguage } from "../_shared/email-i18n.ts";
import { requireEmailDeliveryConfig, sendTransactionalEmail } from "../_shared/email.ts";
import { buildBookingNotificationEmail, type BookingEmailDetails } from "../_shared/email-templates.ts";
import { loadShopReminderSettings } from "../_shared/shop-reminder-settings.ts";

const corsHeaders = jsonCorsHeaders;

type BookingNotificationAction = "created" | "updated" | "deleted";

type BookingPayload = {
  id: string;
  organization_id?: string | null;
  artist_id: string;
  client_user_id?: string | null;
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

function hasRequiredBookingFields(value: BookingPayload | null | undefined): value is BookingPayload {
  return !!value?.id && !!value?.artist_id && !!value?.starts_at && !!value?.ends_at;
}

function isImportedPlaceholderBooking(booking: BookingPayload): boolean {
  const notes = booking.notes?.trim().toLowerCase() ?? "";
  if (!notes) return false;
  return (
    notes.startsWith("imported from csv") ||
    notes.startsWith("imported from json") ||
    notes.includes("contacts export")
  );
}

async function authorizeBookingNotification(
  adminClient: ReturnType<typeof createClient>,
  req: Request,
): Promise<{ ok: true; userId?: string } | { status: number; body: Record<string, unknown> }> {
  if (isCronAuthorized(req)) return { ok: true };

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bearer = parseBearerToken(req);
  if (serviceKey && bearer && bearer === serviceKey) return { ok: true };

  const authResult = await requireAuthenticatedUser(adminClient, req);
  if ("status" in authResult) {
    return { status: authResult.status, body: authResult.body as Record<string, unknown> };
  }

  const canNotify = await callerHasStaffAccess(adminClient, authResult.user.id);
  if (!canNotify) {
    return { status: 403, body: { error: "Forbidden" } };
  }

  return { ok: true, userId: authResult.user.id };
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

    const auth = await authorizeBookingNotification(adminClient, req);
    if (!("ok" in auth)) {
      return jsonResponse(auth.body, auth.status);
    }

    const body = await req.json().catch(() => ({}));
    const action =
      body.action === "deleted" ? "deleted" : body.action === "updated" ? "updated" : body.action === "created" ? "created" : null;
    const bookingPayload = (body.booking ?? null) as BookingPayload | null;
    if (!action || !bookingPayload?.id) {
      return jsonResponse({ error: "Invalid payload. action and booking.id are required." }, 400);
    }

    const { data: bookingRow } = await adminClient
      .from("bookings")
      .select(
        "id, organization_id, artist_id, client_user_id, client_name, client_email, client_phone, booking_type, service_category, status, starts_at, ends_at, notes, tattoo_style, tattoo_size, tattoo_placement, deposit_amount, deposit_paid, suppress_booking_notifications",
      )
      .eq("id", bookingPayload.id)
      .maybeSingle();

    let booking: BookingPayload;
    if (bookingRow) {
      booking = bookingRow as BookingPayload;
    } else if (action === "deleted" && hasRequiredBookingFields(bookingPayload)) {
      booking = bookingPayload;
    } else {
      return jsonResponse({ error: "Booking not found" }, 404);
    }

    if (auth.userId && booking.organization_id) {
      const inOrg = await callerIsOrgMember(adminClient, booking.organization_id, auth.userId);
      if (!inOrg) {
        return jsonResponse({ error: "Forbidden", reason: "booking_org_mismatch" }, 403);
      }
    }

    if ((booking as { suppress_booking_notifications?: boolean }).suppress_booking_notifications) {
      return jsonResponse({
        ok: true,
        emailAttempted: false,
        attempted: 0,
        sent: 0,
        failedCount: 0,
        skipped: "notifications_suppressed",
      });
    }

    if (isImportedPlaceholderBooking(booking)) {
      return jsonResponse({
        ok: true,
        emailAttempted: false,
        attempted: 0,
        sent: 0,
        failedCount: 0,
        skipped: "import_placeholder_booking",
      });
    }

    try {
      requireEmailDeliveryConfig();
    } catch (smtpErr) {
      const message = smtpErr instanceof Error ? smtpErr.message : "Email not configured";
      return jsonResponse({
        ok: false,
        emailAttempted: false,
        error: message,
        hint: "Password reset uses Auth SMTP. Booking emails need Edge Function secrets: RESEND_API_KEY (or SMTP_PASS) and EMAIL_FROM. Run .\\scripts\\setup-email-now.ps1",
      }, 503);
    }

    const { data: recentSent } = await adminClient
      .from("booking_notification_events")
      .select("id")
      .eq("booking_id", booking.id)
      .eq("action", action)
      .eq("status", "sent")
      .gte("sent_at", new Date(Date.now() - 90_000).toISOString())
      .limit(1);
    if (recentSent?.length) {
      return jsonResponse({
        ok: true,
        emailAttempted: false,
        skipped: "duplicate_recent_send",
        attempted: 0,
        sent: 0,
        failedCount: 0,
      });
    }

    const [artistUserRes, artistProfileRes] = await Promise.all([
      adminClient.auth.admin.getUserById(booking.artist_id),
      adminClient.from("profiles").select("display_name").eq("user_id", booking.artist_id).maybeSingle(),
    ]);

    const shopReminderSettings = await loadShopReminderSettings(adminClient, {
      organizationId: (booking as { organization_id?: string | null }).organization_id ?? null,
      artistUserId: booking.artist_id,
    });
    const bookingConfirmationEnabled = shopReminderSettings?.booking_confirmation ?? true;
    if (action === "created" && bookingConfirmationEnabled === false) {
      return jsonResponse({
        ok: true,
        emailAttempted: false,
        attempted: 0,
        sent: 0,
        failedCount: 0,
        skipped: "booking_confirmation_disabled",
      });
    }

    const artistEmailRaw = artistUserRes.data.user?.email?.toLowerCase() ?? null;
    const artistName = artistProfileRes.data?.display_name || "Artist";
    const customerEmailRaw = booking.client_email?.toLowerCase() ?? null;

    const recipients = new Map<string, RecipientInfo>();
    if (isValidEmail(artistEmailRaw)) recipients.set(artistEmailRaw, { role: "artist", name: artistName });
    if (isValidEmail(customerEmailRaw)) recipients.set(customerEmailRaw, { role: "customer", name: booking.client_name || "Customer" });

    const brand = getShopBranding();
    const organizationId = (booking as { organization_id?: string | null }).organization_id ?? null;
    const artistLocale = await resolveEmailLocale(adminClient, {
      recipientUserId: booking.artist_id,
      organizationId,
    });
    const customerLocale = await resolveEmailLocale(adminClient, {
      recipientUserId: (booking as { client_user_id?: string | null }).client_user_id ?? null,
      organizationId,
    });

    const bookingDetails: BookingEmailDetails = {
      ...booking,
      artistName,
      artistEmail: artistEmailRaw,
    };

    const sendJobs = [...recipients.entries()].map(async ([email, recipient]) => {
      const locale: EmailLanguage = recipient.role === "artist" ? artistLocale : customerLocale;
      const subject =
        action === "created"
          ? recipient.role === "artist"
            ? t(locale, "subjects.booking.created.artist", { shopName: brand.shopName })
            : t(locale, "subjects.booking.created.customer", { shopName: brand.shopName })
          : action === "updated"
            ? recipient.role === "artist"
              ? t(locale, "subjects.booking.updated.artist", { shopName: brand.shopName })
              : t(locale, "subjects.booking.updated.customer", { shopName: brand.shopName })
            : recipient.role === "artist"
              ? t(locale, "subjects.booking.deleted.artist", { shopName: brand.shopName })
              : t(locale, "subjects.booking.deleted.customer", { shopName: brand.shopName });

      try {
        const { html, attachments } = buildBookingNotificationEmail({
          action,
          recipientName: recipient.name,
          booking: bookingDetails,
          includeCalendarHint: recipient.role === "customer" || action !== "deleted",
          locale,
        });

        const delivery = await sendTransactionalEmail({
          to: email,
          subject,
          html,
          attachments,
          fromKind: "booking",
        });
        return { ok: true, email, role: recipient.role, subject, provider: delivery.provider };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown email send error";
        console.error("Booking notification send failed", { email, message });
        return { ok: false, email, role: recipient.role, subject, message };
      }
    });

    if (sendJobs.length === 0) {
      return jsonResponse({
        ok: true,
        emailAttempted: false,
        attempted: 0,
        sent: 0,
        failedCount: 0,
        skipped: !isValidEmail(customerEmailRaw) && !isValidEmail(artistEmailRaw) ? "no_valid_recipient_email" : "no_recipients",
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

    return jsonResponse({
      ok: failedCount === 0,
      emailAttempted: true,
      attempted,
      sent,
      failedCount,
      failed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});

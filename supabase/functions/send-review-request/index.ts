import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  callerHasStaffAccess,
  callerIsOrgMember,
  jsonCorsHeaders,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/auth.ts";
import { getShopBrandingForOrganization } from "../_shared/branding.ts";
import { requireEmailDeliveryConfig, sendTransactionalEmail } from "../_shared/email.ts";
import { buildReviewRequestEmail } from "../_shared/email-templates.ts";
import { resolveEmailLocale } from "../_shared/email-i18n.ts";
import { parseShopReviewLinks } from "../_shared/shop-review-links.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: jsonCorsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const auth = await requireAuthenticatedUser(admin, req);
  if ("status" in auth) return jsonResponse(auth.body, auth.status);
  const { user } = auth;

  if (!(await callerHasStaffAccess(admin, user.id))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  let body: { bookingId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const bookingId = body.bookingId?.trim();
  if (!bookingId) {
    return jsonResponse({ error: "bookingId is required" }, 400);
  }

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("id, organization_id, artist_id, client_name, client_email, starts_at, ends_at, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    return jsonResponse({ error: "Booking not found" }, 404);
  }

  const orgId = booking.organization_id as string | null;
  let resolvedOrgId = orgId;
  if (!resolvedOrgId && booking.artist_id) {
    const { data: artistOrg } = await admin.rpc("resolve_user_organization_id", {
      _user_id: booking.artist_id,
    });
    resolvedOrgId = (artistOrg as string | null) ?? null;
  }
  if (!resolvedOrgId) {
    return jsonResponse({ error: "Booking has no organization" }, 400);
  }

  if (!(await callerIsOrgMember(admin, resolvedOrgId, user.id))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const clientEmail = (booking.client_email as string | null)?.trim().toLowerCase();
  if (!clientEmail) {
    return jsonResponse({ error: "no_client_email", message: "This booking has no client email address." }, 400);
  }

  const { data: shopRow, error: shopErr } = await admin
    .from("shop_settings")
    .select("review_links, review_email_message, shop_name, trading_name, support_email")
    .eq("organization_id", resolvedOrgId)
    .maybeSingle();

  if (shopErr || !shopRow) {
    return jsonResponse({ error: "Shop settings not found" }, 404);
  }

  const reviewLinks = parseShopReviewLinks(shopRow.review_links);
  if (reviewLinks.length === 0) {
    return jsonResponse({
      error: "no_review_links",
      message: "Add at least one review link in Admin → Emails → Review links.",
    }, 400);
  }

  const brand = await getShopBrandingForOrganization(admin, resolvedOrgId);
  if (shopRow.support_email) {
    brand.supportEmail = (shopRow.support_email as string).trim() || brand.supportEmail;
  }
  const customMessage = (shopRow.review_email_message as string | null) ?? null;

  const { data: artistProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("user_id", booking.artist_id)
    .maybeSingle();

  const artistName = (artistProfile?.display_name as string | null)?.trim() || "Your artist";
  const locale = await resolveEmailLocale(admin, {
    recipientEmail: clientEmail,
    recipientUserId: null,
    organizationId: resolvedOrgId,
  });

  const html = buildReviewRequestEmail({
    brand,
    clientName: (booking.client_name as string) || "there",
    artistName,
    startsAt: booking.starts_at as string,
    endsAt: booking.ends_at as string,
    reviewLinks,
    customMessage,
    locale,
  });

  try {
    requireEmailDeliveryConfig();
    await sendTransactionalEmail({
      to: clientEmail,
      subject: `${brand.shopName} — we'd love your feedback`,
      html,
      fromDisplayName: brand.shopName,
      replyTo: brand.supportEmail ?? undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: "email_failed", message }, 502);
  }

  await admin.from("booking_review_requests").insert({
    organization_id: resolvedOrgId,
    booking_id: bookingId,
    client_email: clientEmail,
    sent_by: user.id,
  });

  return jsonResponse({
    ok: true,
    emailSent: true,
    recipient: clientEmail,
    linkCount: reviewLinks.length,
  });
});

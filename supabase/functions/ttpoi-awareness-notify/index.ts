import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  jsonCorsHeaders,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/auth.ts";
import { canManageStripeConnect } from "../_shared/stripe-connect.ts";
import { resolveOrganizationForUser } from "../_shared/organization.ts";
import { sendPushToUser, sendPushToUsers } from "../_shared/push-notify.ts";
import {
  emailButton,
  emailLayout,
  requireEmailDeliveryConfig,
  sendTransactionalEmail,
} from "../_shared/email.ts";
import { getShopBrandingForOrganization } from "../_shared/branding.ts";

const corsHeaders = jsonCorsHeaders;

/** Apple Marketing Toolkit Value Proposition–style push body (light customization: brand name). */
const PUSH_TITLE = "Tap to Pay on iPhone";
const PUSH_BODY =
  "Accept contactless cards, Apple Pay, and digital wallets on your iPhone — no extra reader. Enable in Velbok Settings or Checkout.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const authResult = await requireAuthenticatedUser(admin, req);
    if ("status" in authResult) {
      return jsonResponse(authResult.body, authResult.status);
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "push";

    const organizationId = await resolveOrganizationForUser(admin, authResult.user.id);
    if (!organizationId) {
      return jsonResponse({ error: "No organization" }, 400);
    }
    if (!(await canManageStripeConnect(admin, authResult.user.id, organizationId))) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    if (action === "push") {
      const result = await sendPushToUser(admin, authResult.user.id, {
        title: PUSH_TITLE,
        body: PUSH_BODY,
        data: { path: "/settings" },
      });
      return jsonResponse({ ok: result.sent > 0 || result.skipped === "no_tokens", push: result });
    }

    if (action === "launch_email") {
      // Apple 6.1 — Launch email to eligible org admins/owners (Toolkit-style copy shell).
      requireEmailDeliveryConfig();
      const brand = await getShopBrandingForOrganization(admin, organizationId);

      const { data: members } = await admin
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", organizationId)
        .in("role", ["owner", "admin"]);

      const userIds = (members ?? []).map((m) => m.user_id as string).filter(Boolean);
      const emails: string[] = [];
      for (const userId of userIds) {
        const { data } = await admin.auth.admin.getUserById(userId);
        const email = data.user?.email?.trim();
        if (email) emails.push(email);
      }

      if (!emails.length) {
        return jsonResponse({ error: "No admin emails found" }, 400);
      }

      const subject = `Tap to Pay on iPhone is available in Velbok`;
      const html = emailLayout({
        brand,
        badge: "Tap to Pay on iPhone",
        title: "Accept payments on iPhone",
        intro:
          "You can now accept contactless cards, Apple Pay, and other digital wallets with Tap to Pay on iPhone in the Velbok app — no extra hardware required.",
        bodyHtml: `
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8c8c8">
            Open Velbok on an iPhone&nbsp;XS or later, go to <strong style="color:#f0f0f0">Settings</strong>
            or <strong style="color:#f0f0f0">Checkout</strong>, enable Tap to Pay on iPhone, accept Apple’s Terms,
            and follow How to Tap.
          </p>
          ${emailButton("https://velbok.com/download", "Open Velbok")}
          <p style="margin:24px 0 0;font-size:12px;color:#777">
            Before general availability marketing, replace this shell with Apple Marketing Toolkit Launch email assets
            (see public/marketing/ttpoi/README.md).
          </p>
        `,
        footerNote: "External Tap to Pay on iPhone marketing must wait until the app is in full general availability.",
      });

      let sent = 0;
      for (const to of emails) {
        await sendTransactionalEmail({ to, subject, html });
        sent += 1;
      }

      await sendPushToUsers(admin, userIds, {
        title: PUSH_TITLE,
        body: PUSH_BODY,
        data: { path: "/settings" },
      });

      return jsonResponse({ ok: true, emailsSent: sent, recipients: emails.length });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});

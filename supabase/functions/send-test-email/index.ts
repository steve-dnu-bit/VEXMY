import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  callerHasStaffAccess,
  jsonCorsHeaders,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/auth.ts";
import { getShopBranding } from "../_shared/branding.ts";
import {
  emailLayout,
  getEmailDeliveryStatus,
  requireEmailDeliveryConfig,
  sendTransactionalEmail,
} from "../_shared/email.ts";

const corsHeaders = jsonCorsHeaders;

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

    const canSend = await callerHasStaffAccess(admin, authResult.user.id);
    if (!canSend) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const to =
      typeof body.to === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to.trim())
        ? body.to.trim()
        : authResult.user.email;
    if (!to) {
      return jsonResponse({ error: "No recipient email. Pass { to: \"you@example.com\" } or sign in with an email account." }, 400);
    }

    const config = getEmailDeliveryStatus();
    if (!config.from) {
      return jsonResponse({
        ok: false,
        config,
        error: "EMAIL_FROM secret is missing.",
        hint: "Supabase Dashboard → Edge Functions → Secrets → add BOOKINGS_EMAIL_FROM and NOTIFICATIONS_EMAIL_FROM",
      }, 503);
    }
    if (!config.resendApi && !config.smtp) {
      return jsonResponse({
        ok: false,
        config,
        error: "No email provider configured.",
        hint: "Run .\\scripts\\setup-email-now.ps1 or set RESEND_API_KEY + EMAIL_FROM in Supabase secrets.",
      }, 503);
    }

    requireEmailDeliveryConfig();
    const brand = getShopBranding();
    const html = emailLayout({
      brand,
      badge: "Email test",
      title: "VexMy email is working",
      intro: "If you received this message, your studio email configuration is correct.",
      bodyHtml: `<p style="margin:0;font-size:13px;color:#d7d7d7;">Sent at ${new Date().toISOString()} via the send-test-email function.</p>`,
    });

    const result = await sendTransactionalEmail({
      to,
      subject: `VexMy email test — ${brand.shopName}`,
      html,
      fromKind: "notification",
    });

    return jsonResponse({
      ok: true,
      to,
      provider: result.provider,
      config,
      message: `Test email sent via ${result.provider}. Check inbox and junk/spam.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({
      ok: false,
      config: getEmailDeliveryStatus(),
      error: message,
    }, 500);
  }
});

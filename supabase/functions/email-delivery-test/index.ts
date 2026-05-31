import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getShopBranding } from "../_shared/branding.ts";
import {
  emailLayout,
  getEmailDeliveryStatus,
  getEmailFrom,
  jsonCorsHeaders,
  jsonResponse,
  requireCronAuth,
  sendTransactionalEmail,
} from "../_shared/email.ts";

const corsHeaders = jsonCorsHeaders;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const to = typeof body.to === "string" ? body.to.trim() : "";
    const fromKind = body.fromKind === "booking" ? "booking" : "notification";

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return jsonResponse({ error: "Pass JSON body: { \"to\": \"you@example.com\", \"fromKind\": \"booking\" }" }, 400);
    }

    const config = getEmailDeliveryStatus();
    const from = getEmailFrom(fromKind);

    if (!config.resendApi && !config.smtp) {
      return jsonResponse({
        ok: false,
        config,
        from,
        error: "No RESEND_API_KEY or SMTP_PASS in Edge secrets.",
        hint: "Dashboard → Edge Functions → Secrets. Run .\\scripts\\setup-booking-email.ps1",
      }, 503);
    }

    const brand = getShopBranding();
    const html = emailLayout({
      brand,
      badge: "Delivery test",
      title: "Velbok edge email test",
      intro: `This tests ${fromKind} email via Edge Functions (same path as booking confirmations).`,
      bodyHtml: `<p style="margin:0;font-size:13px;color:#d7d7d7;">If this appears in Resend, your API key and From address are correct.</p>`,
    });

    const result = await sendTransactionalEmail({
      to,
      subject: `Velbok ${fromKind} email test`,
      html,
      fromKind,
    });

    return jsonResponse({
      ok: true,
      to,
      from,
      fromKind,
      provider: result.provider,
      config,
      message: "Check Resend → Emails and your inbox.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({
      ok: false,
      config: getEmailDeliveryStatus(),
      from: getEmailFrom("booking"),
      error: message,
      hint: "Common fixes: set RESEND_API_KEY=re_..., use From on verified domain (no-reply@velbok.com).",
    }, 500);
  }
});

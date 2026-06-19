import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jsonCorsHeaders, jsonResponse } from "../_shared/auth.ts";
import { getShopBranding } from "../_shared/branding.ts";
import {
  emailDetailTable,
  emailLayout,
  escapeHtml,
  requireEmailDeliveryConfig,
  sendTransactionalEmail,
} from "../_shared/email.ts";

const corsHeaders = jsonCorsHeaders;

const MAX = {
  name: 120,
  email: 254,
  studio: 160,
  plan: 40,
  message: 5000,
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function trimField(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function planLabel(plan: string): string {
  if (!plan || plan === "not-sure") return "Not sure yet";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));

    const honeypot = trimField(body.honeypot ?? body["bot-field"], 200);
    if (honeypot) {
      return jsonResponse({ ok: true });
    }

    const formLoadedAt = Number(body.formLoadedAt);
    if (Number.isFinite(formLoadedAt) && Date.now() - formLoadedAt < 2500) {
      return jsonResponse({ ok: true });
    }

    const name = trimField(body.name, MAX.name);
    const email = trimField(body.email, MAX.email);
    const studio = trimField(body.studio, MAX.studio);
    const plan = trimField(body.plan, MAX.plan) || "not-sure";
    const message = trimField(body.message, MAX.message);

    if (!name) return jsonResponse({ error: "Name is required" }, 400);
    if (!isValidEmail(email)) return jsonResponse({ error: "Valid email is required" }, 400);
    if (!message) return jsonResponse({ error: "Message is required" }, 400);

    requireEmailDeliveryConfig();
    const brand = getShopBranding();
    const to = brand.supportEmail;

    const html = emailLayout({
      brand,
      badge: "Contact form",
      title: `New message from ${name}`,
      intro: "Someone submitted the Velbok marketing contact form.",
      bodyHtml:
        emailDetailTable([
          { label: "Name", value: name },
          { label: "Email", value: email },
          { label: "Studio", value: studio || "—" },
          { label: "Interested in", value: planLabel(plan) },
        ]) +
        `<div style="margin-top:16px;padding:14px 16px;border:1px solid #2a2a2e;border-radius:10px;background:#0d0d11;">
          <p style="margin:0 0 8px;font-size:12px;color:#9f9f9f;text-transform:uppercase;letter-spacing:.3px;">Message</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#e5e5e5;white-space:pre-wrap;">${escapeHtml(message)}</p>
        </div>`,
      footerNote: `Reply directly to ${email} to respond.`,
    });

    await sendTransactionalEmail({
      to,
      subject: `Velbok contact: ${name}${studio ? ` — ${studio}` : ""}`,
      html,
      fromKind: "notification",
      replyTo: email,
    });

    return jsonResponse({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("submit-contact error:", message);
    return jsonResponse({ error: message }, 500);
  }
});

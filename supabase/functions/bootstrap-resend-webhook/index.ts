import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getResendApiKey } from "../_shared/resend-inbound.ts";

const WEBHOOK_ENDPOINT =
  "https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1/resend-inbound";
const WEBHOOK_EVENTS = ["email.received"];

type BootstrapBody = {
  action?: string;
  to?: string;
};

type ResendWebhook = {
  id: string;
  endpoint: string;
  events: string[];
  status?: string;
};

type ResendListResponse = {
  data?: ResendWebhook[];
};

type ResendCreateResponse = {
  id?: string;
  signing_secret?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isAuthorized(req: Request): boolean {
  const expected = (Deno.env.get("BOOTSTRAP_WEBHOOK_KEY") ?? "").trim();
  if (!expected) return false;
  return req.headers.get("x-bootstrap-key") === expected;
}

async function resendRequest<T>(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }

  if (!res.ok) {
    const message = typeof body === "object" && body && "message" in body
      ? String((body as { message: string }).message)
      : text || res.statusText;
    throw new Error(`Resend API ${res.status}: ${message}`);
  }

  return body as T;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!isAuthorized(req)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const apiKey = getResendApiKey();
  if (!apiKey) {
    return json({ error: "RESEND_API_KEY is not configured in Supabase secrets" }, 500);
  }

  try {
    const body = await req.json().catch(() => ({})) as BootstrapBody;
    const action = body.action?.trim();

    if (action === "domains") {
      const domains = await resendRequest<{ data?: unknown[] }>(apiKey, "/domains");
      return json({ ok: true, domains: domains.data ?? domains });
    }
    if (action === "webhooks") {
      const webhooks = await resendRequest<ResendListResponse>(apiKey, "/webhooks");
      return json({ ok: true, webhooks: webhooks.data ?? webhooks });
    }
    if (action === "received") {
      const received = await resendRequest<{ data?: unknown[] }>(apiKey, "/emails/receiving?limit=10");
      return json({ ok: true, received: received.data ?? received });
    }
    if (action === "sent") {
      const sent = await resendRequest<{ data?: unknown[] }>(apiKey, "/emails?limit=10");
      return json({ ok: true, sent: sent.data ?? sent });
    }
    if (action === "send-inbound-test") {
      const to = body.to?.trim() || "support@velbok.com";
      const sent = await resendRequest<{ id?: string }>(apiKey, "/emails", {
        method: "POST",
        body: JSON.stringify({
          from: "Velbok Test <no-reply@velbok.com>",
          to: [to],
          subject: `Inbound pipeline test ${new Date().toISOString()}`,
          text: "This is an automated test of support@velbok.com inbound forwarding to Hotmail.",
        }),
      });
      return json({ ok: true, sent_id: sent.id, to });
    }

    const listed = await resendRequest<ResendListResponse>(apiKey, "/webhooks");
    const existing = (listed.data ?? []).filter((w) => w.endpoint === WEBHOOK_ENDPOINT);

    const removed: string[] = [];
    for (const webhook of existing) {
      await resendRequest(apiKey, `/webhooks/${webhook.id}`, { method: "DELETE" });
      removed.push(webhook.id);
    }

    const created = await resendRequest<ResendCreateResponse>(apiKey, "/webhooks", {
      method: "POST",
      body: JSON.stringify({
        endpoint: WEBHOOK_ENDPOINT,
        events: WEBHOOK_EVENTS,
      }),
    });

    const signingSecret = created.signing_secret?.trim();
    if (!signingSecret) {
      return json({ error: "Resend did not return signing_secret" }, 502);
    }

    return json({
      ok: true,
      endpoint: WEBHOOK_ENDPOINT,
      events: WEBHOOK_EVENTS,
      webhook_id: created.id,
      signing_secret: signingSecret,
      removed_webhook_ids: removed,
      next_step: "Set RESEND_WEBHOOK_SECRET in Supabase Edge secrets, then remove BOOTSTRAP_WEBHOOK_KEY.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("bootstrap-resend-webhook:", message);
    return json({ error: message }, 500);
  }
});

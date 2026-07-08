import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  loadChannelCredentials,
  resolveOrgFromChannelConnection,
  storeInboundChannelMessage,
  type InboxChannelName,
} from "./inbox-webhook.ts";
import { verifyTwilioWebhookSignature } from "./webhook-signatures.ts";

export function parseTwilioForm(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

export function stripWhatsappPrefix(value: string): string {
  return value.replace(/^whatsapp:/i, "");
}

export function twilioWebhookUrl(req: Request, envKey: string): string {
  const configured = (Deno.env.get(envKey) ?? "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.origin}${url.pathname}`.replace(/\/$/, "");
}

export async function verifyTwilioInboundSignature(
  admin: SupabaseClient,
  channel: Extract<InboxChannelName, "whatsapp" | "sms">,
  req: Request,
  form: Record<string, string>,
  webhookUrl: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; status: number; message: string }> {
  const toRaw = form.To ?? "";
  const to = channel === "whatsapp" ? stripWhatsappPrefix(toRaw) : toRaw.trim();
  if (!to) {
    return { ok: false, status: 400, message: "Missing To" };
  }

  const organizationId = await resolveOrgFromChannelConnection(admin, channel, to);
  if (!organizationId) {
    return { ok: false, status: 200, message: "no_matching_org" };
  }

  const creds = await loadChannelCredentials(admin, organizationId, channel);
  const authToken = creds?.auth_token?.trim() ?? (Deno.env.get("TWILIO_AUTH_TOKEN") ?? "").trim();
  if (!authToken) {
    console.error(`${channel}-webhook: no auth token for org ${organizationId}`);
    return { ok: false, status: 500, message: "Server misconfigured" };
  }

  const signatureOk = await verifyTwilioWebhookSignature(
    authToken,
    req.headers.get("x-twilio-signature"),
    webhookUrl,
    form,
  );
  if (!signatureOk) {
    return { ok: false, status: 401, message: "Invalid signature" };
  }

  return { ok: true, organizationId };
}

export async function handleTwilioInboundMessage(
  admin: SupabaseClient,
  channel: Extract<InboxChannelName, "whatsapp" | "sms">,
  organizationId: string,
  form: Record<string, string>,
): Promise<Response> {
  const fromRaw = form.From ?? "";
  const toRaw = form.To ?? "";
  const from = channel === "whatsapp" ? stripWhatsappPrefix(fromRaw) : fromRaw.trim();
  const to = channel === "whatsapp" ? stripWhatsappPrefix(toRaw) : toRaw.trim();
  const text = (form.Body ?? "").trim();
  const messageSid = form.MessageSid ?? form.SmsSid ?? null;

  if (!from || !text) {
    return new Response(JSON.stringify({ received: true, ignored: "missing_fields" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const stored = await storeInboundChannelMessage(admin, {
    organizationId,
    channel,
    senderName: from,
    senderId: from,
    messageText: text,
    metadata: {
      external_message_id: messageSid,
      provider: "twilio",
      from,
      to,
      received_at: new Date().toISOString(),
    },
  });

  return new Response(
    JSON.stringify({ received: true, stored: stored.stored, message_id: stored.messageId }),
    { headers: { "Content-Type": "application/json" } },
  );
}

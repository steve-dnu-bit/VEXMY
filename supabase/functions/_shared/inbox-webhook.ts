import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { claimInboxMessageQuota, isInboxChannelAllowedForOrg } from "./inbox-limits.ts";

export type InboxChannelName = "whatsapp" | "instagram" | "facebook" | "sms" | "email";

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.endsWith(nb.slice(-9)) || nb.endsWith(na.slice(-9));
}

export async function resolveOrgFromChannelConnection(
  admin: SupabaseClient,
  channel: InboxChannelName,
  identifier: string,
): Promise<string | null> {
  const { data: connections, error } = await admin
    .from("channel_connections")
    .select("organization_id, credentials")
    .eq("channel", channel)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  for (const row of connections || []) {
    const creds = (row.credentials ?? {}) as Record<string, string>;
    if (channel === "whatsapp" || channel === "sms") {
      const phone = creds.phone_number ?? "";
      if (phonesMatch(identifier, phone)) return row.organization_id as string;
    }
    if (channel === "instagram" || channel === "facebook") {
      const pageId = creds.page_id ?? "";
      if (pageId && pageId === identifier) return row.organization_id as string;
    }
  }

  return null;
}

export async function storeInboundChannelMessage(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    channel: InboxChannelName;
    senderName: string;
    senderId: string;
    messageText: string;
    metadata: Record<string, unknown>;
  },
): Promise<{ stored: boolean; messageId?: string }> {
  const externalId = params.metadata.external_message_id;
  if (typeof externalId === "string" && externalId) {
    const { data: existing } = await admin
      .from("messages")
      .select("id")
      .contains("metadata", { external_message_id: externalId })
      .maybeSingle();
    if (existing?.id) return { stored: false, messageId: existing.id };
  }

  const allowed = await isInboxChannelAllowedForOrg(admin, params.organizationId, params.channel);
  if (!allowed) return { stored: false };

  const quota = await claimInboxMessageQuota(admin, params.organizationId, "inbound");
  if (!quota.allowed) return { stored: false };

  const { data: inserted, error } = await admin
    .from("messages")
    .insert({
      organization_id: params.organizationId,
      channel: params.channel,
      direction: "inbound",
      sender_name: params.senderName,
      sender_id: params.senderId,
      message_text: params.messageText,
      is_read: false,
      metadata: params.metadata,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { stored: true, messageId: inserted.id };
}

export async function loadChannelCredentials(
  admin: SupabaseClient,
  organizationId: string,
  channel: InboxChannelName,
): Promise<Record<string, string> | null> {
  const { data, error } = await admin
    .from("channel_connections")
    .select("credentials")
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.credentials || typeof data.credentials !== "object") return null;
  return data.credentials as Record<string, string>;
}

export async function sendTwilioMessage(
  creds: Record<string, string>,
  to: string,
  body: string,
  useWhatsapp = false,
): Promise<void> {
  const accountSid = creds.account_sid?.trim();
  const authToken = creds.auth_token?.trim();
  const fromNumber = creds.phone_number?.trim();
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio credentials incomplete");
  }

  const from = useWhatsapp ? `whatsapp:${fromNumber}` : fromNumber;
  const toAddr = useWhatsapp ? `whatsapp:${to}` : to;

  const params = new URLSearchParams({
    From: from,
    To: toAddr,
    Body: body,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio send failed: ${text.slice(0, 300)}`);
  }
}

export async function sendMetaMessage(
  creds: Record<string, string>,
  recipientId: string,
  body: string,
): Promise<void> {
  const pageId = creds.page_id?.trim();
  const accessToken = creds.access_token?.trim();
  if (!pageId || !accessToken) throw new Error("Meta credentials incomplete");

  const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: body },
      messaging_type: "RESPONSE",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta send failed: ${text.slice(0, 300)}`);
  }
}

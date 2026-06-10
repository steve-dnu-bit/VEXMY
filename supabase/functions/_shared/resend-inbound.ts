import { Webhook } from "npm:svix@1.67.0";

export type ResendInboundEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    message_id?: string;
    attachments?: Array<{
      id: string;
      filename: string;
      content_type: string;
      content_disposition?: string | null;
      content_id?: string | null;
    }>;
  };
};

export type ResendReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string | null;
  html: string | null;
  text: string | null;
  headers?: Record<string, string>;
  message_id?: string;
  attachments?: Array<{
    id: string;
    filename: string;
    content_type: string;
    content_disposition?: string | null;
    content_id?: string | null;
  }>;
};

export function getResendApiKey(): string {
  return (Deno.env.get("RESEND_API_KEY") ?? Deno.env.get("SMTP_PASS") ?? Deno.env.get("SMTP_PASSWORD") ?? "").trim();
}

export function verifyResendWebhook(rawBody: string, req: Request): ResendInboundEvent {
  const secret = (Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "").trim();
  if (!secret) throw new Error("RESEND_WEBHOOK_SECRET is not configured");

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new Error("Missing Svix signature headers");
  }

  const wh = new Webhook(secret);
  return wh.verify(rawBody, {
    "svix-id": svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": svixSignature,
  }) as ResendInboundEvent;
}

export async function fetchReceivedEmail(emailId: string, apiKey?: string): Promise<ResendReceivedEmail> {
  const key = (apiKey ?? getResendApiKey()).trim();
  if (!key) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend receiving API ${res.status}: ${text || res.statusText}`);
  }

  return await res.json() as ResendReceivedEmail;
}

export function parseEmailAddress(value: string): { name: string; email: string } {
  const trimmed = value.trim();
  const match = /^(?:"?([^"]*)"?\s*)?<([^>]+)>$/.exec(trimmed);
  if (match) {
    const name = (match[1] ?? "").trim();
    const email = match[2].trim().toLowerCase();
    return { name: name || email, email };
  }
  return { name: trimmed, email: trimmed.toLowerCase() };
}

export function emailBodyText(email: ResendReceivedEmail): string {
  const text = email.text?.trim();
  if (text) return text;
  const html = email.html?.trim();
  if (!html) return "(No message body)";
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim() || "(No message body)";
}

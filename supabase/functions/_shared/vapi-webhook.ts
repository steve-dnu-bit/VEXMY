import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getShopBranding } from "./branding.ts";
import {
  emailDetailTable,
  emailLayout,
  escapeHtml,
  requireEmailDeliveryConfig,
  sendTransactionalEmail,
} from "./email.ts";
import { timingSafeEqual, verifyVapiWebhookSignature } from "./webhook-signatures.ts";

export type VapiServerMessage = {
  type?: string;
  endedReason?: string;
  summary?: string;
  durationSeconds?: number;
  cost?: number;
  recordingUrl?: string;
  call?: {
    id?: string;
    assistantId?: string;
    type?: string;
    status?: string;
    startedAt?: string;
    endedAt?: string;
    customer?: { number?: string; name?: string; email?: string };
    phoneNumber?: { number?: string };
  };
  artifact?: {
    transcript?: string;
    summary?: string;
    recordingUrl?: string;
    messages?: Array<{ role?: string; message?: string; content?: string }>;
    recording?: {
      stereoUrl?: string;
      mono?: { combinedUrl?: string };
    };
  };
};

export type VapiWebhookPayload = {
  message?: VapiServerMessage;
  call?: VapiServerMessage["call"];
  type?: string;
};

export function normalizeVapiMessage(payload: VapiWebhookPayload): VapiServerMessage | null {
  const message = (payload.message ?? payload) as VapiServerMessage;
  if (!message || typeof message !== "object") return null;

  const rootCall = payload.call ?? {};
  const messageCall = message.call ?? {};
  const type = message.type ?? payload.type;

  return {
    ...message,
    type,
    call: { ...rootCall, ...messageCall },
  };
}

export async function verifyVapiRequest(rawBody: string, req: Request): Promise<boolean> {
  const secret = (Deno.env.get("VAPI_WEBHOOK_SECRET") ?? "").trim();
  if (!secret) return false;

  const plainSecret =
    req.headers.get("x-vapi-secret") ??
    req.headers.get("X-VAPI-Secret") ??
    req.headers.get("X-Vapi-Secret");
  if (plainSecret && timingSafeEqual(plainSecret.trim(), secret)) return true;

  const signature =
    req.headers.get("x-vapi-signature") ??
    req.headers.get("X-Vapi-Signature") ??
    req.headers.get("X-VAPI-Signature");
  if (!signature) return false;

  if (await verifyVapiWebhookSignature(rawBody, signature, secret)) return true;

  try {
    const normalized = JSON.stringify(JSON.parse(rawBody));
    return verifyVapiWebhookSignature(normalized, signature, secret);
  } catch {
    return false;
  }
}

function transcriptEmailTo(brandSupportEmail: string): string {
  const explicit = (Deno.env.get("VAPI_TRANSCRIPT_EMAIL") ?? "").trim();
  if (explicit) return explicit;

  const forward = (Deno.env.get("RESEND_INBOUND_FORWARD_TO") ?? "").trim();
  if (forward) return forward;

  return brandSupportEmail;
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function resolveRecordingUrl(message: VapiServerMessage): string | null {
  return (
    message.recordingUrl?.trim() ||
    message.artifact?.recordingUrl?.trim() ||
    message.artifact?.recording?.stereoUrl?.trim() ||
    message.artifact?.recording?.mono?.combinedUrl?.trim() ||
    null
  );
}

function resolveTranscript(message: VapiServerMessage): string {
  const direct = message.artifact?.transcript?.trim();
  if (direct) return direct;

  const messages = message.artifact?.messages ?? [];
  if (!messages.length) return "";

  return messages
    .map((entry) => {
      const role = (entry.role ?? "unknown").toLowerCase();
      const label = role === "assistant" || role === "bot" ? "AI" : role === "user" ? "Caller" : role;
      const text = (entry.message ?? entry.content ?? "").trim();
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function resolveCustomerNumber(message: VapiServerMessage): string | null {
  return (
    message.call?.customer?.number?.trim() ||
    message.call?.phoneNumber?.number?.trim() ||
    null
  );
}

export async function storeVapiEndOfCallReport(
  admin: SupabaseClient,
  message: VapiServerMessage,
): Promise<{ inserted: boolean; id: string | null }> {
  const callId = message.call?.id?.trim();
  if (!callId) {
    console.warn("vapi-webhook: end-of-call-report missing call.id");
    return { inserted: false, id: null };
  }

  const transcript = resolveTranscript(message);
  const summary = (message.summary ?? message.artifact?.summary ?? "").trim() || null;
  const recordingUrl = resolveRecordingUrl(message);

  const row = {
    vapi_call_id: callId,
    assistant_id: message.call?.assistantId?.trim() || null,
    call_type: message.call?.type?.trim() || null,
    customer_number: resolveCustomerNumber(message),
    customer_name: message.call?.customer?.name?.trim() || null,
    customer_email: message.call?.customer?.email?.trim() || null,
    ended_reason: message.endedReason?.trim() || null,
    duration_seconds: message.durationSeconds ?? null,
    cost: message.cost ?? null,
    transcript: transcript || null,
    summary,
    recording_url: recordingUrl,
    messages: message.artifact?.messages ?? null,
    started_at: message.call?.startedAt ?? null,
    ended_at: message.call?.endedAt ?? null,
    metadata: {
      callStatus: message.call?.status ?? null,
    },
  };

  const { data, error } = await admin
    .from("vapi_call_logs")
    .upsert(row, { onConflict: "vapi_call_id" })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("vapi-webhook: failed to store call log", error.message);
    throw new Error(error.message);
  }

  return { inserted: !!data?.id, id: (data?.id as string | undefined) ?? null };
}

export async function emailVapiEndOfCallReport(message: VapiServerMessage): Promise<void> {
  requireEmailDeliveryConfig();
  const brand = getShopBranding();
  const transcript = resolveTranscript(message);
  const summary = (message.summary ?? message.artifact?.summary ?? "").trim();
  const recordingUrl = resolveRecordingUrl(message);
  const customerNumber = resolveCustomerNumber(message);
  const callId = message.call?.id?.trim() ?? "unknown";

  const subjectParts = ["Velbok Vapi call"];
  if (customerNumber) subjectParts.push(customerNumber);
  else if (message.call?.customer?.name) subjectParts.push(message.call.customer.name);

  const html = emailLayout({
    brand,
    badge: "Vapi call transcript",
    title: "New Velbok support call",
    intro: "A caller finished a conversation with the Velbok Vapi assistant.",
    bodyHtml:
      emailDetailTable([
        { label: "Call ID", value: callId },
        { label: "Caller", value: customerNumber || message.call?.customer?.name || "—" },
        { label: "Email", value: message.call?.customer?.email || "—" },
        { label: "Duration", value: formatDuration(message.durationSeconds) },
        { label: "Ended", value: message.endedReason || "—" },
        { label: "Recording", value: recordingUrl || "—" },
      ]) +
      (summary
        ? `<div style="margin-top:16px;padding:14px 16px;border:1px solid #2a2a2e;border-radius:10px;background:#0d0d11;">
          <p style="margin:0 0 8px;font-size:12px;color:#9f9f9f;text-transform:uppercase;letter-spacing:.3px;">Summary</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#e5e5e5;white-space:pre-wrap;">${escapeHtml(summary)}</p>
        </div>`
        : "") +
      `<div style="margin-top:16px;padding:14px 16px;border:1px solid #2a2a2e;border-radius:10px;background:#0d0d11;">
        <p style="margin:0 0 8px;font-size:12px;color:#9f9f9f;text-transform:uppercase;letter-spacing:.3px;">Transcript</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#e5e5e5;white-space:pre-wrap;">${escapeHtml(transcript || "(No transcript captured)")}</p>
      </div>`,
    footerNote: "Transcripts are also stored in Velbok for platform admins.",
  });

  const to = transcriptEmailTo(brand.supportEmail);
  await sendTransactionalEmail({
    to,
    subject: subjectParts.join(" — "),
    html,
    fromKind: "notification",
    replyTo: message.call?.customer?.email?.trim() || undefined,
  });
}

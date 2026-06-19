import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  resolveOrgFromChannelConnection,
  storeInboundChannelMessage,
} from "../_shared/inbox-webhook.ts";
import { verifyMetaWebhookSignature } from "../_shared/webhook-signatures.ts";

type MetaMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string };
  timestamp?: number;
};

type MetaEntry = {
  id?: string;
  messaging?: MetaMessagingEvent[];
};

serve(async (req) => {
  const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "";

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const appSecret = (Deno.env.get("META_APP_SECRET") ?? "").trim();
    const rawBody = await req.text();
    if (!appSecret) {
      console.error("meta-webhook: META_APP_SECRET not configured");
      return new Response("Server misconfigured", { status: 500 });
    }

    const signatureOk = await verifyMetaWebhookSignature(
      rawBody,
      req.headers.get("x-hub-signature-256"),
      appSecret,
    );
    if (!signatureOk) {
      return new Response("Invalid signature", { status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response("Server misconfigured", { status: 500 });
    }

    const payload = JSON.parse(rawBody);
    const entries = (payload?.entry ?? []) as MetaEntry[];
    const admin = createClient(supabaseUrl, serviceKey);
    let storedCount = 0;

    for (const entry of entries) {
      const pageId = entry.id ?? "";
      for (const event of entry.messaging ?? []) {
        const text = event.message?.text?.trim();
        const senderId = event.sender?.id;
        if (!text || !senderId || !pageId) continue;

        let organizationId = await resolveOrgFromChannelConnection(admin, "instagram", pageId);
        let channel: "instagram" | "facebook" = "instagram";
        if (!organizationId) {
          organizationId = await resolveOrgFromChannelConnection(admin, "facebook", pageId);
          channel = "facebook";
        }
        if (!organizationId) continue;

        const stored = await storeInboundChannelMessage(admin, {
          organizationId,
          channel,
          senderName: senderId,
          senderId,
          messageText: text,
          metadata: {
            external_message_id: event.message?.mid ?? null,
            provider: "meta",
            page_id: pageId,
            timestamp: event.timestamp ?? null,
            received_at: new Date().toISOString(),
          },
        });
        if (stored.stored) storedCount += 1;
      }
    }

    return new Response(JSON.stringify({ received: true, stored: storedCount }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("meta-webhook error:", message);
    return new Response(message, { status: 400 });
  }
});

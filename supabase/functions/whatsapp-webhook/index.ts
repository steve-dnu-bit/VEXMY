import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  resolveOrgFromChannelConnection,
  storeInboundChannelMessage,
} from "../_shared/inbox-webhook.ts";

function parseTwilioForm(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function stripWhatsappPrefix(value: string): string {
  return value.replace(/^whatsapp:/i, "");
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response("Server misconfigured", { status: 500 });
    }

    const rawBody = await req.text();
    const form = parseTwilioForm(rawBody);
    const from = stripWhatsappPrefix(form.From ?? "");
    const to = stripWhatsappPrefix(form.To ?? "");
    const text = (form.Body ?? "").trim();
    const messageSid = form.MessageSid ?? form.SmsSid ?? null;

    if (!from || !text) {
      return new Response(JSON.stringify({ received: true, ignored: "missing_fields" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const organizationId = await resolveOrgFromChannelConnection(admin, "whatsapp", to);
    if (!organizationId) {
      return new Response(JSON.stringify({ received: true, ignored: "no_matching_org" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const stored = await storeInboundChannelMessage(admin, {
      organizationId,
      channel: "whatsapp",
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
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("whatsapp-webhook error:", message);
    return new Response(message, { status: 400 });
  }
});

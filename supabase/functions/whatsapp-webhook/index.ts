import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  handleTwilioInboundMessage,
  parseTwilioForm,
  twilioWebhookUrl,
  verifyTwilioInboundSignature,
} from "../_shared/twilio-inbound-webhook.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const rawBody = await req.text();
    const form = parseTwilioForm(rawBody);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response("Server misconfigured", { status: 500 });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const webhookUrl = twilioWebhookUrl(req, "TWILIO_WEBHOOK_URL");
    const verified = await verifyTwilioInboundSignature(admin, "whatsapp", req, form, webhookUrl);

    if (!verified.ok) {
      if (verified.message === "no_matching_org") {
        return new Response(JSON.stringify({ received: true, ignored: verified.message }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(verified.message, { status: verified.status });
    }

    return await handleTwilioInboundMessage(admin, "whatsapp", verified.organizationId, form);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("whatsapp-webhook error:", message);
    return new Response(message, { status: 400 });
  }
});

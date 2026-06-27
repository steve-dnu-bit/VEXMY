import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonCorsHeaders, jsonResponse } from "../_shared/auth.ts";
import {
  emailVapiEndOfCallReport,
  normalizeVapiMessage,
  storeVapiEndOfCallReport,
  verifyVapiRequest,
  type VapiWebhookPayload,
} from "../_shared/vapi-webhook.ts";

const corsHeaders = jsonCorsHeaders;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const webhookSecret = (Deno.env.get("VAPI_WEBHOOK_SECRET") ?? "").trim();
  if (!webhookSecret) {
    console.error("vapi-webhook: VAPI_WEBHOOK_SECRET is not configured");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  try {
    const rawBody = await req.text();
    if (!(await verifyVapiRequest(rawBody, req))) {
      console.warn("vapi-webhook: rejected request (bad or missing signature)");
      return jsonResponse({ error: "Invalid signature" }, 401);
    }

    const payload = JSON.parse(rawBody) as VapiWebhookPayload;
    const message = normalizeVapiMessage(payload);
    const messageType = message?.type ?? "";

    console.log("vapi-webhook: received", messageType || "unknown");

    if (messageType === "tool-calls") {
      return jsonResponse({ results: [] });
    }

    if (messageType === "end-of-call-report" && message) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!supabaseUrl || !serviceKey) {
        return jsonResponse({ error: "Server misconfigured" }, 500);
      }

      const admin = createClient(supabaseUrl, serviceKey);
      await storeVapiEndOfCallReport(admin, message);

      try {
        await emailVapiEndOfCallReport(message);
        console.log("vapi-webhook: transcript emailed for call", message.call?.id ?? "unknown");
      } catch (emailError) {
        const detail = emailError instanceof Error ? emailError.message : "Unknown email error";
        console.error("vapi-webhook: transcript email failed", detail);
      }
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    console.error("vapi-webhook error:", detail);
    return jsonResponse({ error: detail }, 500);
  }
});

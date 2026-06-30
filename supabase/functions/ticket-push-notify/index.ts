import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonCorsHeaders, jsonResponse, requireCronAuth } from "../_shared/auth.ts";
import { sendTicketPushOnly } from "../_shared/ticket-email.ts";

const corsHeaders = jsonCorsHeaders;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronDenied = requireCronAuth(req);
  if (cronDenied) return cronDenied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const ticketId = typeof body.ticket_id === "string" ? body.ticket_id.trim() : "";
    const recipientId = typeof body.recipient_id === "string" ? body.recipient_id.trim() : "";
    const senderId = typeof body.sender_id === "string" ? body.sender_id.trim() : "";
    const previewText =
      typeof body.preview_text === "string" ? body.preview_text : "You received a new inbox message.";

    if (!ticketId || !recipientId || !senderId) {
      return jsonResponse({ error: "ticket_id, recipient_id, and sender_id are required" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const result = await sendTicketPushOnly(admin, {
      ticketId,
      recipientId,
      senderId,
      previewText,
    });

    return jsonResponse({ ok: true, push: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});

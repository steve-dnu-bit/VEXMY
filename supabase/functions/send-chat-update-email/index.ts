import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonCorsHeaders, jsonResponse, requireAuthenticatedUser } from "../_shared/auth.ts";
import { sendChatUpdateEmail } from "../_shared/chat-email.ts";

const corsHeaders = jsonCorsHeaders;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const auth = await requireAuthenticatedUser(admin, req);
    if ("status" in auth) {
      return jsonResponse(auth.body, auth.status);
    }
    const sender = auth.user;

    const body = await req.json().catch(() => ({}));
    const threadId = typeof body.threadId === "string" ? body.threadId : null;
    const previewTextRaw = typeof body.previewText === "string" ? body.previewText : "There is a new message in your chat.";
    const previewText = previewTextRaw.slice(0, 280);
    if (!threadId) {
      return jsonResponse({ error: "threadId is required" }, 400);
    }

    const { data: thread, error: threadError } = await admin
      .from("chat_threads")
      .select("id, artist_id, customer_id")
      .eq("id", threadId)
      .single();
    if (threadError || !thread) {
      return jsonResponse({ error: threadError?.message || "Thread not found" }, 404);
    }

    const senderIsMember = sender.id === thread.artist_id || sender.id === thread.customer_id;
    if (!senderIsMember) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const recipientId = sender.id === thread.artist_id ? thread.customer_id : thread.artist_id;
    const result = await sendChatUpdateEmail(admin, {
      threadId,
      recipientId,
      senderId: sender.id,
      previewText,
    });

    if (result.ok) {
      return jsonResponse({ ok: true, recipientEmail: result.recipientEmail });
    }
    if (result.skipped) {
      return jsonResponse({ ok: false, skipped: true, reason: result.reason });
    }
    return jsonResponse({ error: result.reason || "Send failed" }, 500);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonCorsHeaders, jsonResponse, requireCronAuth } from "../_shared/auth.ts";
import { sendChatUpdateEmail, shouldSkipChatEmailNotification } from "../_shared/chat-email.ts";

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

    const admin = createClient(supabaseUrl, serviceKey);
    const now = new Date().toISOString();

    const { data: rows, error } = await admin
      .from("chat_email_notification_queue")
      .select("id, thread_id, recipient_id, sender_id, last_message_id, preview_text")
      .is("sent_at", null)
      .is("canceled_at", null)
      .lte("notify_after", now)
      .order("notify_after", { ascending: true })
      .limit(50);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    let sent = 0;
    let canceled = 0;
    let failed = 0;
    const failures: Array<{ id: string; reason: string }> = [];

    for (const row of rows ?? []) {
      const skipReason = await shouldSkipChatEmailNotification(admin, row);
      if (skipReason) {
        await admin
          .from("chat_email_notification_queue")
          .update({ canceled_at: now, updated_at: now })
          .eq("id", row.id);
        canceled += 1;
        continue;
      }

      const result = await sendChatUpdateEmail(admin, {
        threadId: row.thread_id,
        recipientId: row.recipient_id,
        senderId: row.sender_id,
        previewText: row.preview_text,
      });

      if (result.ok) {
        await admin
          .from("chat_email_notification_queue")
          .update({ sent_at: now, updated_at: now })
          .eq("id", row.id);
        sent += 1;
        continue;
      }

      if (result.skipped) {
        await admin
          .from("chat_email_notification_queue")
          .update({ canceled_at: now, updated_at: now })
          .eq("id", row.id);
        canceled += 1;
        continue;
      }

      failed += 1;
      failures.push({ id: row.id, reason: result.reason || "send_failed" });
    }

    return jsonResponse({
      ok: true,
      processed: (rows ?? []).length,
      sent,
      canceled,
      failed,
      failures,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});

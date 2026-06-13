import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonCorsHeaders, jsonResponse, requireCronAuth } from "../_shared/auth.ts";
import { sendChatUpdateEmail, shouldSkipChatEmailNotification } from "../_shared/chat-email.ts";
import { sendTicketUpdateEmail, shouldSkipTicketEmailNotification } from "../_shared/ticket-email.ts";

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

    const { data: chatRows, error: chatError } = await admin
      .from("chat_email_notification_queue")
      .select("id, thread_id, recipient_id, sender_id, last_message_id, preview_text")
      .is("sent_at", null)
      .is("canceled_at", null)
      .lte("notify_after", now)
      .order("notify_after", { ascending: true })
      .limit(50);

    if (chatError) {
      return jsonResponse({ error: chatError.message }, 500);
    }

    let chatSent = 0;
    let chatCanceled = 0;
    let chatFailed = 0;
    const chatFailures: Array<{ id: string; reason: string }> = [];

    for (const row of chatRows ?? []) {
      const skipReason = await shouldSkipChatEmailNotification(admin, row);
      if (skipReason) {
        await admin
          .from("chat_email_notification_queue")
          .update({ canceled_at: now, updated_at: now })
          .eq("id", row.id);
        chatCanceled += 1;
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
        chatSent += 1;
        continue;
      }

      if (result.skipped) {
        await admin
          .from("chat_email_notification_queue")
          .update({ canceled_at: now, updated_at: now })
          .eq("id", row.id);
        chatCanceled += 1;
        continue;
      }

      chatFailed += 1;
      chatFailures.push({ id: row.id, reason: result.reason || "send_failed" });
    }

    const { data: ticketRows, error: ticketError } = await admin
      .from("ticket_email_notification_queue")
      .select("id, ticket_id, recipient_id, sender_id, last_message_id, preview_text")
      .is("sent_at", null)
      .is("canceled_at", null)
      .lte("notify_after", now)
      .order("notify_after", { ascending: true })
      .limit(50);

    if (ticketError) {
      return jsonResponse({ error: ticketError.message }, 500);
    }

    let ticketSent = 0;
    let ticketCanceled = 0;
    let ticketFailed = 0;
    const ticketFailures: Array<{ id: string; reason: string }> = [];

    for (const row of ticketRows ?? []) {
      const skipReason = await shouldSkipTicketEmailNotification(admin, row);
      if (skipReason) {
        await admin
          .from("ticket_email_notification_queue")
          .update({ canceled_at: now, updated_at: now })
          .eq("id", row.id);
        ticketCanceled += 1;
        continue;
      }

      const result = await sendTicketUpdateEmail(admin, {
        ticketId: row.ticket_id,
        recipientId: row.recipient_id,
        senderId: row.sender_id,
        previewText: row.preview_text,
      });

      if (result.ok) {
        await admin
          .from("ticket_email_notification_queue")
          .update({ sent_at: now, updated_at: now })
          .eq("id", row.id);
        ticketSent += 1;
        continue;
      }

      if (result.skipped) {
        await admin
          .from("ticket_email_notification_queue")
          .update({ canceled_at: now, updated_at: now })
          .eq("id", row.id);
        ticketCanceled += 1;
        continue;
      }

      ticketFailed += 1;
      ticketFailures.push({ id: row.id, reason: result.reason || "send_failed" });
    }

    return jsonResponse({
      ok: true,
      chat: {
        processed: (chatRows ?? []).length,
        sent: chatSent,
        canceled: chatCanceled,
        failed: chatFailed,
        failures: chatFailures,
      },
      tickets: {
        processed: (ticketRows ?? []).length,
        sent: ticketSent,
        canceled: ticketCanceled,
        failed: ticketFailed,
        failures: ticketFailures,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getShopBranding } from "./branding.ts";
import { requireEmailDeliveryConfig, sendTransactionalEmail, siteUrl } from "./email.ts";
import { buildChatUpdateEmail } from "./email-templates.ts";

export type ChatEmailSendResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  recipientEmail?: string;
};

export async function sendChatUpdateEmail(
  admin: SupabaseClient,
  params: {
    threadId: string;
    recipientId: string;
    senderId: string;
    previewText: string;
  },
): Promise<ChatEmailSendResult> {
  const { threadId, recipientId, senderId, previewText } = params;

  const { data: thread, error: threadError } = await admin
    .from("chat_threads")
    .select("id, artist_id, customer_id")
    .eq("id", threadId)
    .single();
  if (threadError || !thread) {
    return { ok: false, skipped: true, reason: threadError?.message || "thread_not_found" };
  }

  const participantIds = [thread.artist_id, thread.customer_id];
  if (!participantIds.includes(recipientId) || !participantIds.includes(senderId)) {
    return { ok: false, skipped: true, reason: "invalid_participants" };
  }

  const [{ data: recipientProfile }, { data: senderProfile }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("user_id", recipientId).maybeSingle(),
    admin.from("profiles").select("display_name").eq("user_id", senderId).maybeSingle(),
  ]);

  const { data: recipientAuth, error: recipientAuthError } = await admin.auth.admin.getUserById(recipientId);
  const recipientEmail = recipientAuth.user?.email ?? null;
  if (recipientAuthError || !recipientEmail) {
    return { ok: false, skipped: true, reason: "recipient_email_not_found" };
  }

  try {
    requireEmailDeliveryConfig();
  } catch (configError) {
    const message = configError instanceof Error ? configError.message : "Email not configured";
    return { ok: false, skipped: true, reason: message };
  }

  const baseUrl = siteUrl();
  const isArtistRecipient = recipientId === thread.artist_id;
  const chatPath = isArtistRecipient
    ? `/inbox?customerId=${encodeURIComponent(thread.customer_id)}`
    : "/account/chats";
  const chatUrl = `${baseUrl}${chatPath}`;

  const senderName = senderProfile?.display_name || "Someone";
  const recipientName = recipientProfile?.display_name || "there";
  const brand = getShopBranding();

  const html = buildChatUpdateEmail({
    recipientName,
    senderName,
    previewText: previewText.slice(0, 280),
    chatUrl,
  });

  await sendTransactionalEmail({
    to: recipientEmail,
    subject: `New chat update — ${brand.shopName}`,
    html,
  });

  return { ok: true, recipientEmail };
}

export async function shouldSkipChatEmailNotification(
  admin: SupabaseClient,
  row: {
    thread_id: string;
    recipient_id: string;
    last_message_id: string;
  },
): Promise<string | null> {
  const { data: message } = await admin
    .from("chat_messages")
    .select("id, created_at, sender_id")
    .eq("id", row.last_message_id)
    .maybeSingle();
  if (!message) return "message_missing";

  const { data: member } = await admin
    .from("chat_members")
    .select("last_read_at")
    .eq("thread_id", row.thread_id)
    .eq("user_id", row.recipient_id)
    .maybeSingle();

  if (member?.last_read_at && new Date(member.last_read_at).getTime() >= new Date(message.created_at).getTime()) {
    return "already_read";
  }

  const { data: reply } = await admin
    .from("chat_messages")
    .select("id")
    .eq("thread_id", row.thread_id)
    .eq("sender_id", row.recipient_id)
    .gt("created_at", message.created_at)
    .limit(1)
    .maybeSingle();

  if (reply?.id) return "recipient_replied";

  return null;
}

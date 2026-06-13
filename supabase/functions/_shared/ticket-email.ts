import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getShopBranding } from "./branding.ts";
import { requireEmailDeliveryConfig, sendTransactionalEmail, siteUrl } from "./email.ts";
import { buildChatUpdateEmail } from "./email-templates.ts";

export type TicketEmailSendResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  recipientEmail?: string;
};

export async function sendTicketUpdateEmail(
  admin: SupabaseClient,
  params: {
    ticketId: string;
    recipientId: string;
    senderId: string;
    previewText: string;
  },
): Promise<TicketEmailSendResult> {
  const { ticketId, recipientId, senderId, previewText } = params;

  const { data: ticket, error: ticketError } = await admin
    .from("support_tickets")
    .select("id, customer_id, organization_id")
    .eq("id", ticketId)
    .single();
  if (ticketError || !ticket) {
    return { ok: false, skipped: true, reason: ticketError?.message || "ticket_not_found" };
  }

  const participantIds = [ticket.customer_id];
  if (recipientId !== ticket.customer_id && senderId !== ticket.customer_id) {
    // staff recipient path is valid
  } else if (!participantIds.includes(recipientId) && recipientId !== ticket.customer_id) {
    const { data: staffOk } = await admin.rpc("staff_can_access_org_tickets", {
      _org_id: ticket.organization_id,
      _user_id: recipientId,
    });
    if (!staffOk) {
      return { ok: false, skipped: true, reason: "invalid_recipient" };
    }
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
  const isStaffRecipient = recipientId !== ticket.customer_id;
  const ticketPath = isStaffRecipient
    ? `/inbox?ticketId=${encodeURIComponent(ticketId)}`
    : `/account/tickets?ticketId=${encodeURIComponent(ticketId)}`;
  const ticketUrl = `${baseUrl}${ticketPath}`;

  const senderName = senderProfile?.display_name || "Someone";
  const recipientName = recipientProfile?.display_name || "there";
  const brand = getShopBranding();

  const html = buildChatUpdateEmail({
    recipientName,
    senderName,
    previewText: previewText.slice(0, 280),
    chatUrl: ticketUrl,
  });

  await sendTransactionalEmail({
    to: recipientEmail,
    subject: `New inbox message — ${brand.shopName}`,
    html,
  });

  return { ok: true, recipientEmail };
}

export async function shouldSkipTicketEmailNotification(
  admin: SupabaseClient,
  row: {
    ticket_id: string;
    recipient_id: string;
    last_message_id: string;
  },
): Promise<string | null> {
  const { data: message } = await admin
    .from("support_ticket_messages")
    .select("id, created_at, sender_id")
    .eq("id", row.last_message_id)
    .maybeSingle();
  if (!message) return "message_missing";

  const { data: reply } = await admin
    .from("support_ticket_messages")
    .select("id")
    .eq("ticket_id", row.ticket_id)
    .eq("sender_id", row.recipient_id)
    .gt("created_at", message.created_at)
    .limit(1)
    .maybeSingle();

  if (reply?.id) return "recipient_replied";

  return null;
}

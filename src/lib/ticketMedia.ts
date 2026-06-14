import { supabase } from "@/integrations/supabase/client";
import { getTicketMediaMaxForPlan, PLAN_TICKET_MEDIA_MAX } from "@/lib/pricingPlans";

/** Default when plan is unknown (Starter). */
export const TICKET_MEDIA_MAX_PER_USER = PLAN_TICKET_MEDIA_MAX.starter;
export const TICKET_MEDIA_BUCKET = "ticket-media";

export type SupportTicketMediaRow = {
  id: string;
  ticket_id: string;
  message_id: string;
  uploaded_by: string;
  bucket: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export async function fetchOrgTicketMediaMax(orgId: string): Promise<number> {
  const { data, error } = await supabase.rpc("org_plan_feature_number", {
    _org_id: orgId,
    _feature: "ticket_media_max_per_user",
  });
  if (error) return TICKET_MEDIA_MAX_PER_USER;
  const max = typeof data === "number" ? data : Number(data);
  return Number.isFinite(max) && max > 0 ? max : TICKET_MEDIA_MAX_PER_USER;
}

export async function countTicketMediaForUser(ticketId: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("support_ticket_media" as any)
    .select("*", { count: "exact", head: true })
    .eq("ticket_id", ticketId)
    .eq("uploaded_by", userId);

  if (error) return 0;
  return count ?? 0;
}

export async function loadTicketMediaByMessageIds(
  ticketId: string,
): Promise<Record<string, SupportTicketMediaRow>> {
  const { data, error } = await supabase
    .from("support_ticket_media" as any)
    .select("*")
    .eq("ticket_id", ticketId);

  if (error || !data) return {};

  const map: Record<string, SupportTicketMediaRow> = {};
  (data as SupportTicketMediaRow[]).forEach((row) => {
    map[row.message_id] = row;
  });
  return map;
}

export async function signTicketMediaUrls(
  mediaByMessageId: Record<string, SupportTicketMediaRow>,
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  await Promise.all(
    Object.entries(mediaByMessageId).map(async ([messageId, media]) => {
      const { data } = await supabase.storage.from(TICKET_MEDIA_BUCKET).createSignedUrl(media.storage_path, 60 * 60);
      if (data?.signedUrl) urls[messageId] = data.signedUrl;
    }),
  );
  return urls;
}

export async function uploadTicketImage(
  ticketId: string,
  userId: string,
  file: File,
  maxPerUser: number = TICKET_MEDIA_MAX_PER_USER,
): Promise<{ messageId: string }> {
  const limit = maxPerUser > 0 ? maxPerUser : TICKET_MEDIA_MAX_PER_USER;
  const used = await countTicketMediaForUser(ticketId, userId);
  if (used >= limit) {
    throw new Error("limit");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("type");
  }

  const path = `${ticketId}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const { error: uploadError } = await supabase.storage.from(TICKET_MEDIA_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: message, error: messageError } = await supabase
    .from("support_ticket_messages" as any)
    .insert({
      ticket_id: ticketId,
      sender_id: userId,
      body: file.name,
      message_type: "media",
    })
    .select("id")
    .single();

  if (messageError || !message?.id) {
    await supabase.storage.from(TICKET_MEDIA_BUCKET).remove([path]);
    throw new Error(messageError?.message || "message_failed");
  }

  const { error: mediaError } = await supabase.from("support_ticket_media" as any).insert({
    ticket_id: ticketId,
    message_id: message.id,
    uploaded_by: userId,
    storage_path: path,
    mime_type: file.type || null,
    size_bytes: file.size,
  });

  if (mediaError) {
    await supabase.from("support_ticket_messages" as any).delete().eq("id", message.id);
    await supabase.storage.from(TICKET_MEDIA_BUCKET).remove([path]);
    throw new Error(mediaError.message);
  }

  return { messageId: message.id as string };
}

export { getTicketMediaMaxForPlan };

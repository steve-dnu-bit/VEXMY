import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isFcmConfigured, sendFcmToDeviceToken, type FcmPushPayload } from "./fcm-push.ts";

export type PushDeliveryResult = {
  attempted: number;
  sent: number;
  failed: number;
  deactivated: number;
  skipped: string | null;
};

export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: FcmPushPayload,
): Promise<PushDeliveryResult> {
  if (!userId?.trim()) {
    return { attempted: 0, sent: 0, failed: 0, deactivated: 0, skipped: "no_user" };
  }
  if (!isFcmConfigured()) {
    return { attempted: 0, sent: 0, failed: 0, deactivated: 0, skipped: "fcm_not_configured" };
  }

  const { data: tokens, error } = await admin
    .from("device_push_tokens")
    .select("id, token")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    return { attempted: 0, sent: 0, failed: 0, deactivated: 0, skipped: error.message };
  }
  if (!tokens?.length) {
    return { attempted: 0, sent: 0, failed: 0, deactivated: 0, skipped: "no_tokens" };
  }

  let sent = 0;
  let failed = 0;
  let deactivated = 0;

  for (const row of tokens) {
    const result = await sendFcmToDeviceToken(row.token as string, payload);
    if (result.ok) {
      sent += 1;
      await admin
        .from("device_push_tokens")
        .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", row.id);
      continue;
    }

    failed += 1;
    if (result.invalidToken) {
      deactivated += 1;
      await admin
        .from("device_push_tokens")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  return { attempted: tokens.length, sent, failed, deactivated, skipped: null };
}

export async function sendPushToUsers(
  admin: SupabaseClient,
  userIds: string[],
  payload: FcmPushPayload,
): Promise<PushDeliveryResult> {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let deactivated = 0;
  let skipped: string | null = null;

  for (const userId of unique) {
    const result = await sendPushToUser(admin, userId, payload);
    attempted += result.attempted;
    sent += result.sent;
    failed += result.failed;
    deactivated += result.deactivated;
    if (result.skipped && result.skipped !== "no_tokens") skipped = result.skipped;
  }

  return { attempted, sent, failed, deactivated, skipped };
}

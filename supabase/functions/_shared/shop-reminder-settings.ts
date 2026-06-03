import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type ShopReminderSettingsRow = {
  user_id: string;
  booking_confirmation: boolean;
  deposit_reminder: boolean;
  appointment_reminder: boolean;
  deposit_reminder_timing: string;
  appointment_reminder_timing: string;
  reminder_channel: string;
};

/** Resolve the primary admin and load shop-wide reminder settings (one row per studio). */
export async function loadShopReminderSettings(
  admin: SupabaseClient,
): Promise<ShopReminderSettingsRow | null> {
  const { data: adminRoles, error: roleErr } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .order("user_id", { ascending: true })
    .limit(1);
  if (roleErr || !adminRoles?.length) return null;

  const ownerId = adminRoles[0].user_id as string;
  const { data, error } = await admin
    .from("reminder_settings")
    .select(
      "user_id, booking_confirmation, deposit_reminder, appointment_reminder, deposit_reminder_timing, appointment_reminder_timing, reminder_channel",
    )
    .eq("user_id", ownerId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ShopReminderSettingsRow;
}

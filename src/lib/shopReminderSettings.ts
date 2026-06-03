import { supabase } from "@/integrations/supabase/client";

export interface ShopReminderSettings {
  bookingConfirmation: boolean;
  depositReminder: boolean;
  appointmentReminder: boolean;
  depositReminderTiming: string;
  appointmentReminderTiming: string;
  reminderChannel: string;
}

export const defaultShopReminderSettings: ShopReminderSettings = {
  bookingConfirmation: true,
  depositReminder: false,
  appointmentReminder: false,
  depositReminderTiming: "24h",
  appointmentReminderTiming: "24h",
  reminderChannel: "email",
};

/** Primary admin user_id — shop-wide reminder_settings are stored on this row. */
export async function getShopReminderSettingsUserId(): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .order("user_id", { ascending: true })
    .limit(1);
  if (error || !data?.length) return null;
  return data[0].user_id;
}

export async function loadShopReminderSettings(): Promise<ShopReminderSettings> {
  const ownerId = await getShopReminderSettingsUserId();
  if (!ownerId) return { ...defaultShopReminderSettings };

  const { data, error } = await supabase
    .from("reminder_settings" as any)
    .select(
      "booking_confirmation, deposit_reminder, appointment_reminder, deposit_reminder_timing, appointment_reminder_timing, reminder_channel",
    )
    .eq("user_id", ownerId)
    .maybeSingle();

  if (error || !data) return { ...defaultShopReminderSettings };

  return {
    bookingConfirmation: !!data.booking_confirmation,
    depositReminder: !!data.deposit_reminder,
    appointmentReminder: !!data.appointment_reminder,
    depositReminderTiming: data.deposit_reminder_timing || "24h",
    appointmentReminderTiming: data.appointment_reminder_timing || "24h",
    reminderChannel: data.reminder_channel || "email",
  };
}

export async function saveShopReminderSettings(settings: ShopReminderSettings): Promise<{ error: string | null }> {
  const ownerId = await getShopReminderSettingsUserId();
  if (!ownerId) return { error: "No shop admin found" };

  const { error } = await supabase.from("reminder_settings" as any).upsert(
    {
      user_id: ownerId,
      booking_confirmation: settings.bookingConfirmation,
      deposit_reminder: settings.depositReminder,
      appointment_reminder: settings.appointmentReminder,
      deposit_reminder_timing: settings.depositReminderTiming,
      appointment_reminder_timing: settings.appointmentReminderTiming,
      reminder_channel: settings.reminderChannel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return { error: error?.message ?? null };
}

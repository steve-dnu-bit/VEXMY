import { supabase } from "@/integrations/supabase/client";
import { getUserOrganizationId } from "@/lib/shopSettings";

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

const REMINDER_COLUMNS =
  "booking_confirmation, deposit_reminder, appointment_reminder, deposit_reminder_timing, appointment_reminder_timing, reminder_channel";

function rowToSettings(data: Record<string, unknown>): ShopReminderSettings {
  return {
    bookingConfirmation: !!data.booking_confirmation,
    depositReminder: !!data.deposit_reminder,
    appointmentReminder: !!data.appointment_reminder,
    depositReminderTiming: (data.deposit_reminder_timing as string) || "24h",
    appointmentReminderTiming: (data.appointment_reminder_timing as string) || "24h",
    reminderChannel: (data.reminder_channel as string) || "email",
  };
}

/** Primary shop owner user_id — reminder_settings are stored on this row per studio. */
export async function resolveShopReminderOwnerUserId(orgId?: string | null): Promise<string | null> {
  const resolvedOrgId = orgId ?? (await getUserOrganizationId());
  if (resolvedOrgId) {
    const { data: owner } = await supabase
      .from("organization_members" as any)
      .select("user_id")
      .eq("organization_id", resolvedOrgId)
      .eq("role", "owner")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (owner?.user_id) return owner.user_id as string;

    const { data: orgAdmin } = await supabase
      .from("organization_members" as any)
      .select("user_id")
      .eq("organization_id", resolvedOrgId)
      .eq("role", "admin")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (orgAdmin?.user_id) return orgAdmin.user_id as string;
  }

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
  const ownerId = await resolveShopReminderOwnerUserId();
  if (!ownerId) return { ...defaultShopReminderSettings };

  const { data, error } = await supabase
    .from("reminder_settings" as any)
    .select(REMINDER_COLUMNS)
    .eq("user_id", ownerId)
    .maybeSingle();

  if (error) {
    console.warn("loadShopReminderSettings:", error.message);
    return { ...defaultShopReminderSettings };
  }
  if (!data) return { ...defaultShopReminderSettings };

  return rowToSettings(data as Record<string, unknown>);
}

export async function saveShopReminderSettings(settings: ShopReminderSettings): Promise<{ error: string | null }> {
  const ownerId = await resolveShopReminderOwnerUserId();
  if (!ownerId) return { error: "No shop admin found for this studio" };

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

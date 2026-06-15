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

async function resolveShopReminderOwnerUserId(
  admin: SupabaseClient,
  organizationId?: string | null,
  artistUserId?: string | null,
): Promise<string | null> {
  let orgId = organizationId?.trim() || null;

  if (!orgId && artistUserId) {
    const { data: orgFromArtist } = await admin.rpc("resolve_user_organization_id", {
      _user_id: artistUserId,
    });
    if (orgFromArtist) orgId = orgFromArtist as string;
  }

  if (orgId) {
    const { data: owner } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("role", "owner")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (owner?.user_id) return owner.user_id as string;

    const { data: orgAdmin } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("role", "admin")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (orgAdmin?.user_id) return orgAdmin.user_id as string;
  }

  const { data: adminRoles, error: roleErr } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .order("user_id", { ascending: true })
    .limit(1);
  if (roleErr || !adminRoles?.length) return null;
  return adminRoles[0].user_id as string;
}

/** Load shop-wide reminder settings for a studio (scoped by org when available). */
export async function loadShopReminderSettings(
  admin: SupabaseClient,
  options?: { organizationId?: string | null; artistUserId?: string | null },
): Promise<ShopReminderSettingsRow | null> {
  const ownerId = await resolveShopReminderOwnerUserId(
    admin,
    options?.organizationId,
    options?.artistUserId,
  );
  if (!ownerId) return null;

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

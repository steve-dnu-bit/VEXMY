import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type OrganizationRecord = {
  id: string;
  name: string;
  stripe_customer_id: string | null;
};

async function organizationExists(admin: SupabaseClient, organizationId: string): Promise<boolean> {
  const { data } = await admin.from("organizations").select("id").eq("id", organizationId).maybeSingle();
  return !!data?.id;
}

export async function resolveOrganizationForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: memberOrgId } = await admin.rpc("get_user_organization_id", { _user_id: userId });
  if (memberOrgId && (await organizationExists(admin, memberOrgId as string))) {
    return memberOrgId as string;
  }

  const { data: shop } = await admin
    .from("shop_settings")
    .select("organization_id")
    .not("organization_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (shop?.organization_id && (await organizationExists(admin, shop.organization_id))) {
    return shop.organization_id;
  }

  const { data: soleOrg } = await admin
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return soleOrg?.id ?? null;
}

export async function canManageOrganizationBilling(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const { data: isPlatformAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isPlatformAdmin) return true;

  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  return !!membership && ["owner", "admin"].includes(membership.role);
}

export async function loadOrganizationRecord(
  admin: SupabaseClient,
  organizationId: string,
): Promise<{ org: OrganizationRecord | null; error: string | null }> {
  const { data: org, error } = await admin
    .from("organizations")
    .select("id, name, stripe_customer_id")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) return { org: null, error: error.message };
  return { org: org as OrganizationRecord | null, error: null };
}

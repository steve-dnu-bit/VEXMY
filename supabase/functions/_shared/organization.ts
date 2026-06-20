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

/** User's org from membership (or single-org deployment fallback via SQL RPC only). */
export async function resolveOrganizationForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: resolvedOrgId } = await admin.rpc("resolve_user_organization_id", { _user_id: userId });
  if (resolvedOrgId && (await organizationExists(admin, resolvedOrgId as string))) {
    return resolvedOrgId as string;
  }
  return null;
}

export async function canManageOrganizationBilling(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const { data: isPlatformAdmin } = await admin.rpc("is_platform_admin", { _user_id: userId });
  if (isPlatformAdmin) return true;

  const { data: isOrgAdmin } = await admin.rpc("is_org_admin", {
    _org_id: organizationId,
    _user_id: userId,
  });
  return !!isOrgAdmin;
}

/** Resolve org from booking row when organization_id is missing (legacy/migrated rows). */
export async function resolveBookingOrganizationId(
  admin: SupabaseClient,
  params: { organizationId?: string | null; artistId?: string | null },
): Promise<string | null> {
  const direct = params.organizationId?.trim();
  if (direct) return direct;
  const artistId = params.artistId?.trim();
  if (!artistId) return null;
  return resolveOrganizationForUser(admin, artistId);
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

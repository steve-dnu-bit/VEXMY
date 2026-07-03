import { supabase } from "@/integrations/supabase/client";
import { getUserOrganizationId } from "@/lib/shopSettings";

export type OrganizationArtistProfile = {
  user_id: string;
  display_name: string;
  portal_bg_color?: string | null;
};

/** Artists who belong to the current studio org (not every artist in the database). */
export async function loadOrganizationArtists(orgId?: string | null): Promise<OrganizationArtistProfile[]> {
  const memberIds = await loadOrganizationMemberIds(orgId);
  if (!memberIds || memberIds.size === 0) return [];

  const memberIdList = [...memberIds];
  const { data: roleRows, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "artist")
    .in("user_id", memberIdList);

  if (rolesError) return [];

  const artistIds = (roleRows ?? []).map((row) => row.user_id);
  if (artistIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id, display_name, portal_bg_color")
    .in("user_id", artistIds);

  if (profilesError) return [];
  return (profiles ?? []) as OrganizationArtistProfile[];
}

/** Org member user IDs for the current studio, or null when org scoping does not apply. */
export async function loadOrganizationMemberIds(orgId?: string | null): Promise<Set<string> | null> {
  const resolved = orgId ?? (await getUserOrganizationId());
  if (!resolved) return null;

  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", resolved);

  if (error) return null;
  return new Set((data ?? []).map((row) => row.user_id));
}

/** Customer user IDs linked to the current studio organization. */
export async function loadOrganizationCustomerIds(orgId?: string | null): Promise<Set<string>> {
  const memberIds = await loadOrganizationMemberIds(orgId);
  if (!memberIds || memberIds.size === 0) return new Set();

  const ids = [...memberIds];
  const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "customer").in("user_id", ids);

  return new Set((roleRows ?? []).map((row) => row.user_id));
}

export function filterByOrganizationMembers<T extends { user_id: string }>(
  rows: T[],
  memberIds: Set<string> | null,
): T[] {
  if (!memberIds) return rows;
  return rows.filter((row) => memberIds.has(row.user_id));
}

export function filterUserIdsByOrganization(userIds: string[], memberIds: Set<string> | null): string[] {
  if (!memberIds) return userIds;
  return userIds.filter((id) => memberIds.has(id));
}

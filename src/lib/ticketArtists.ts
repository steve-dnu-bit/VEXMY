import { supabase } from "@/integrations/supabase/client";
import { filterUserIdsByOrganization, loadOrganizationMemberIds } from "@/lib/organizationMembers";

export type StudioArtistOption = { id: string; name: string };
export type MessageableCustomerOption = { id: string; name: string };

export async function loadStudioArtists(organizationId: string | null | undefined): Promise<StudioArtistOption[]> {
  if (!organizationId) return [];

  const orgMemberIds = await loadOrganizationMemberIds(organizationId);
  const [{ data: roleRows }, { data: profileRows }] = await Promise.all([
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("profiles").select("user_id, display_name, public_profile_completed, customer_profile_completed"),
  ]);

  const rolesByUser = new Map<string, string[]>();
  (roleRows || []).forEach((r) => {
    const existing = rolesByUser.get(r.user_id) || [];
    existing.push(r.role);
    rolesByUser.set(r.user_id, existing);
  });

  const staffIds = (profileRows || [])
    .map((p) => p.user_id)
    .filter((id) => {
      const roles = rolesByUser.get(id) || [];
      const profile = (profileRows || []).find((p) => p.user_id === id);
      const hasArtistRole = roles.includes("artist");
      const looksLikePublicArtistProfile = profile?.public_profile_completed === true;
      if (!(hasArtistRole || looksLikePublicArtistProfile)) return false;
      if (roles.length === 1 && roles[0] === "customer") return false;
      if (!hasArtistRole && profile?.customer_profile_completed === true) return false;
      return true;
    });

  const uniqueStaffIds = filterUserIdsByOrganization([...new Set(staffIds)], orgMemberIds);
  const profilesById = new Map((profileRows || []).map((p) => [p.user_id, p]));

  return uniqueStaffIds
    .map((id) => ({
      id,
      name: profilesById.get(id)?.display_name || "Artist",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadMessageableCustomers(
  userId: string,
  isAdmin: boolean,
): Promise<MessageableCustomerOption[]> {
  const byId = new Map<string, MessageableCustomerOption>();

  let bookingQuery = supabase.from("bookings").select("client_user_id, client_name").not("client_user_id", "is", null);
  if (!isAdmin) {
    bookingQuery = bookingQuery.eq("artist_id", userId);
  }
  const { data: bookingLinks } = await bookingQuery;

  const bookingUserIds = [...new Set((bookingLinks || []).map((b) => b.client_user_id).filter(Boolean))] as string[];

  if (bookingUserIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", bookingUserIds);
    (profiles || []).forEach((p) => {
      byId.set(p.user_id, { id: p.user_id, name: (p.display_name || "").trim() || p.user_id });
    });
  }

  (bookingLinks || []).forEach((b) => {
    if (!b.client_user_id || byId.has(b.client_user_id)) return;
    byId.set(b.client_user_id, {
      id: b.client_user_id,
      name: (b.client_name || "").trim() || b.client_user_id,
    });
  });

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

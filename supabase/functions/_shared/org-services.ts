import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type OrgServiceRow = {
  booking_type: string;
  service_category: string;
  duration: number;
  name: string;
};

/** Active services for a studio organization. */
export async function loadActiveServicesForBooking(
  admin: SupabaseClient,
  params: { organizationId?: string | null; artistId?: string | null },
): Promise<OrgServiceRow[]> {
  const select = "booking_type, service_category, duration, name";

  if (params.organizationId) {
    await admin.rpc("ensure_default_org_services", { _org_id: params.organizationId });

    const { data: services } = await admin
      .from("services")
      .select(select)
      .eq("organization_id", params.organizationId)
      .eq("is_active", true)
      .order("sort_order");

    return (services || []) as OrgServiceRow[];
  }

  if (params.artistId) {
    const { data: member } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", params.artistId)
      .limit(1)
      .maybeSingle();

    if (member?.organization_id) {
      return loadActiveServicesForBooking(admin, { organizationId: member.organization_id as string });
    }
  }

  return [];
}

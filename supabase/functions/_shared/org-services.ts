import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type OrgServiceRow = {
  booking_type: string;
  service_category: string;
  duration: number;
  name: string;
};

/** Active services for a studio (org members), falling back to the booking artist. */
export async function loadActiveServicesForBooking(
  admin: SupabaseClient,
  params: { organizationId?: string | null; artistId?: string | null },
): Promise<OrgServiceRow[]> {
  const select = "booking_type, service_category, duration, name";

  if (params.organizationId) {
    const { data: members } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", params.organizationId);
    const userIds = [...new Set((members || []).map((m) => m.user_id as string).filter(Boolean))];
    if (userIds.length > 0) {
      const { data: services } = await admin
        .from("services")
        .select(select)
        .eq("is_active", true)
        .in("created_by", userIds);
      if (services?.length) return services as OrgServiceRow[];
    }
  }

  if (params.artistId) {
    const { data: services } = await admin
      .from("services")
      .select(select)
      .eq("is_active", true)
      .eq("created_by", params.artistId);
    return (services || []) as OrgServiceRow[];
  }

  return [];
}

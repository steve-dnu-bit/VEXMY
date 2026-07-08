import { supabase } from "@/integrations/supabase/client";
import { normalizeClientEmail } from "@/lib/clientConduct";
import { getUserOrganizationId } from "@/lib/shopSettings";

export type ClientVipBookingRef = {
  id: string;
  organization_id?: string | null;
  client_user_id?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_name: string;
};

function clientBookingsQuery(orgId: string, booking: ClientVipBookingRef) {
  let query = supabase.from("bookings").select("id, vip_client").eq("organization_id", orgId);
  const userId = (booking.client_user_id || "").trim();
  if (userId) return query.eq("client_user_id", userId);
  const email = normalizeClientEmail(booking.client_email);
  if (email) return query.ilike("client_email", email);
  const phone = (booking.client_phone || "").trim();
  if (phone) return query.eq("client_phone", phone);
  return query.eq("client_name", booking.client_name);
}

export async function clientHasVipBookings(booking: ClientVipBookingRef): Promise<boolean> {
  const orgId = booking.organization_id ?? (await getUserOrganizationId());
  if (!orgId) return !!booking.vip_client;
  const { data } = await clientBookingsQuery(orgId, booking).eq("vip_client", true).limit(1);
  return (data?.length ?? 0) > 0;
}

export async function setClientVipForOrganization(
  booking: ClientVipBookingRef,
  nextVip: boolean,
): Promise<{ error: string | null; updatedCount: number }> {
  const orgId = booking.organization_id ?? (await getUserOrganizationId());
  if (!orgId) return { error: "organization_missing", updatedCount: 0 };

  const userId = (booking.client_user_id || "").trim();
  const email = normalizeClientEmail(booking.client_email);
  const phone = (booking.client_phone || "").trim();
  const name = (booking.client_name || "").trim();

  const { data, error } = await supabase.rpc("set_client_vip_for_organization", {
    p_organization_id: orgId,
    p_client_user_id: userId || null,
    p_client_email: email,
    p_client_phone: phone || null,
    p_client_name: name || null,
    p_vip: nextVip,
  });

  if (error) return { error: error.message, updatedCount: 0 };

  const updatedCount = typeof data === "number" ? data : 0;
  if (updatedCount === 0) {
    return { error: "no_bookings_updated", updatedCount: 0 };
  }

  return { error: null, updatedCount };
}

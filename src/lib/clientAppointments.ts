import { supabase } from "@/integrations/supabase/client";
import { normalizeClientEmail, normalizeClientPhone } from "@/lib/clientConduct";

export type ClientAppointmentRow = {
  id: string;
  artist_id: string;
  client_name: string;
  starts_at: string;
  ends_at: string;
  booking_type: string;
  status: string;
  tattoo_style: string | null;
};

/** PostgREST `.or()` filter — match linked account, email, phone, or name fallback. */
export function buildStaffClientBookingsOrFilter(input: {
  clientUserId?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientName?: string | null;
}): string | null {
  const parts: string[] = [];
  const userId = (input.clientUserId || "").trim();
  if (userId) parts.push(`client_user_id.eq.${userId}`);

  const email = normalizeClientEmail(input.clientEmail);
  if (email) parts.push(`client_email.ilike.${email}`);

  const phone = normalizeClientPhone(input.clientPhone);
  if (phone) parts.push(`client_phone.ilike.*${phone}*`);

  if (parts.length === 0) {
    const name = (input.clientName || "").trim();
    if (name) parts.push(`client_name.ilike.${name}`);
  }

  return parts.length > 0 ? parts.join(",") : null;
}

export async function fetchClientAppointments(input: {
  clientUserId?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientName?: string | null;
}): Promise<{ rows: ClientAppointmentRow[]; error: string | null }> {
  const orFilter = buildStaffClientBookingsOrFilter(input);
  if (!orFilter) {
    return { rows: [], error: null };
  }

  const pageSize = 500;
  let from = 0;
  const rows: ClientAppointmentRow[] = [];

  for (;;) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, artist_id, client_name, starts_at, ends_at, booking_type, status, tattoo_style")
      .or(orFilter)
      .order("starts_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { rows: [], error: error.message };
    if (!data?.length) break;

    rows.push(...(data as ClientAppointmentRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { rows, error: null };
}

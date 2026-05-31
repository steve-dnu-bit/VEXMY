import type { SupabaseClient } from "@supabase/supabase-js";

export type ThreadBookingContext = {
  customerName: string;
  customerPhone: string | null;
  booking: {
    id: string;
    starts_at: string;
    ends_at: string;
    deposit_paid: boolean | null;
    status: string;
    tattoo_style: string | null;
  } | null;
  hasConsent: boolean;
};

export async function fetchThreadBookingContext(
  supabase: SupabaseClient,
  thread: { artist_id: string; customer_id: string },
): Promise<ThreadBookingContext> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, phone")
    .eq("user_id", thread.customer_id)
    .maybeSingle();

  const customerName = profile?.display_name?.trim() || "Client";
  const customerPhone = profile?.phone?.trim() || null;

  const nowIso = new Date().toISOString();
  const { data: upcoming } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, deposit_paid, status, tattoo_style")
    .eq("artist_id", thread.artist_id)
    .eq("client_user_id", thread.customer_id)
    .gte("starts_at", nowIso)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let booking = upcoming ?? null;
  if (!booking) {
    const { data: recent } = await supabase
      .from("bookings")
      .select("id, starts_at, ends_at, deposit_paid, status, tattoo_style")
      .eq("artist_id", thread.artist_id)
      .eq("client_user_id", thread.customer_id)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    booking = recent ?? null;
  }

  let hasConsent = false;
  if (booking?.id) {
    const { data: consentRow } = await supabase
      .from("consent_signatures")
      .select("id")
      .eq("booking_id", booking.id)
      .limit(1)
      .maybeSingle();
    hasConsent = !!consentRow?.id;
  }

  return {
    customerName,
    customerPhone,
    booking,
    hasConsent,
  };
}

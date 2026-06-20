import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { resolveOrganizationForUser } from "./organization.ts";
import { getConnectAccountForOrganization, stripeRequestOptions } from "./stripe-connect.ts";

export type DepositBookingRow = {
  id: string;
  artist_id: string;
  organization_id?: string | null;
  client_user_id?: string | null;
  client_name: string;
  client_email: string | null;
  starts_at: string;
  ends_at: string;
  booking_type: string;
  service_category: string | null;
  status: string;
  deposit_amount: number | null;
};

export function isPaidDepositCheckoutSession(
  session: Stripe.Checkout.Session,
  bookingId: string,
): boolean {
  const sessionBookingId = session.metadata?.booking_id || null;
  return (
    session.mode === "payment" &&
    (session.payment_status === "paid" || session.status === "complete") &&
    session.metadata?.kind === "deposit" &&
    sessionBookingId === bookingId
  );
}

export async function resolveDepositConnectAccountId(
  admin: SupabaseClient,
  booking: Pick<DepositBookingRow, "artist_id" | "organization_id">,
): Promise<string | null> {
  const orgId =
    booking.organization_id ?? (await resolveOrganizationForUser(admin, booking.artist_id));
  if (!orgId) return null;
  const ctx = await getConnectAccountForOrganization(admin, orgId);
  return ctx?.stripeConnectAccountId ?? null;
}

/** Retrieve a Connect-hosted deposit checkout session (tries shop Connect account, then platform). */
export async function retrieveDepositCheckoutSession(
  stripe: Stripe,
  admin: SupabaseClient,
  sessionId: string,
  booking: Pick<DepositBookingRow, "artist_id" | "organization_id">,
): Promise<Stripe.Checkout.Session | null> {
  const connectAccountId = await resolveDepositConnectAccountId(admin, booking);
  const attempts: Array<Stripe.RequestOptions | undefined> = [];
  if (connectAccountId) {
    attempts.push(stripeRequestOptions(connectAccountId));
  }
  attempts.push(undefined);

  for (const opts of attempts) {
    try {
      const session = opts
        ? await stripe.checkout.sessions.retrieve(sessionId, {}, opts)
        : await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.kind === "deposit" || session.metadata?.booking_id) {
        return session;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function markBookingDepositPaid(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ bookingId: string | null; newlyMarkedPaid: boolean }> {
  return markBookingDepositPaidByRef(admin, {
    bookingId: session.metadata?.booking_id ?? null,
    sessionId: session.id,
    paymentRef: String(session.payment_intent || session.id),
  });
}

export async function markBookingDepositPaidByRef(
  admin: SupabaseClient,
  options: {
    bookingId?: string | null;
    sessionId?: string | null;
    paymentRef: string;
  },
): Promise<{ bookingId: string | null; newlyMarkedPaid: boolean }> {
  const paymentRef = options.paymentRef;
  let bookingId = options.bookingId ?? null;

  if (!bookingId && options.sessionId) {
    const { data: fallbackBooking } = await admin
      .from("bookings")
      .select("id")
      .eq("deposit_payment_id", options.sessionId)
      .limit(1)
      .maybeSingle();
    bookingId = fallbackBooking?.id || null;
  }

  if (!bookingId) {
    const { data: fallbackBooking } = await admin
      .from("bookings")
      .select("id")
      .eq("deposit_payment_id", paymentRef)
      .limit(1)
      .maybeSingle();
    bookingId = fallbackBooking?.id || null;
  }

  if (!bookingId) {
    return { bookingId: null, newlyMarkedPaid: false };
  }

  const { data: updatedRows } = await admin
    .from("bookings")
    .update({
      deposit_paid: true,
      deposit_link_sent: true,
      deposit_payment_id: paymentRef,
    } as any)
    .eq("id", bookingId)
    .or("deposit_paid.is.null,deposit_paid.eq.false")
    .select("id")
    .limit(1);

  return {
    bookingId,
    newlyMarkedPaid: (updatedRows?.length || 0) > 0,
  };
}

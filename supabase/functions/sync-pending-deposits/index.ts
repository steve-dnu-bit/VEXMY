import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonCorsHeaders, jsonResponse, requireCronAuth } from "../_shared/auth.ts";
import {
  isPaidDepositCheckoutSession,
  markBookingDepositPaid,
  retrieveDepositCheckoutSession,
} from "../_shared/deposit-payment.ts";
import { createConnectStripe } from "../_shared/stripe-keys.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: jsonCorsHeaders });

  const cronError = requireCronAuth(req);
  if (cronError) return cronError;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const stripe = createConnectStripe();

  const { data: pending, error } = await admin
    .from("bookings")
    .select("id, artist_id, organization_id, deposit_payment_id")
    .eq("deposit_link_sent", true)
    .or("deposit_paid.is.null,deposit_paid.eq.false")
    .not("deposit_payment_id", "is", null)
    .order("starts_at", { ascending: true })
    .limit(100);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  let checked = 0;
  let confirmed = 0;
  const errors: string[] = [];

  for (const booking of pending || []) {
    const sessionId = booking.deposit_payment_id;
    if (!sessionId?.startsWith("cs_")) continue;

    checked += 1;
    try {
      const session = await retrieveDepositCheckoutSession(stripe, admin, sessionId, booking);
      if (session && isPaidDepositCheckoutSession(session, booking.id)) {
        const { newlyMarkedPaid } = await markBookingDepositPaid(admin, session);
        if (newlyMarkedPaid) confirmed += 1;
      }
    } catch (e) {
      errors.push(`${booking.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return jsonResponse({
    ok: true,
    checked,
    confirmed,
    errors: errors.length ? errors.slice(0, 5) : undefined,
  });
});

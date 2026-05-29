import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { getShopBranding } from "../_shared/branding.ts";
import { getSmtpConfig, sendTransactionalEmail } from "../_shared/email.ts";
import { buildDepositReceiptEmail, type BookingEmailDetails } from "../_shared/email-templates.ts";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
    if (!supabaseUrl || !serviceKey || !stripeSecret || !webhookSecret) {
      return new Response("Server misconfigured", { status: 500 });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) return new Response("Missing stripe-signature", { status: 400 });

    const rawBody = await req.text();
    const stripe = new Stripe(stripeSecret);
    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    const admin = createClient(supabaseUrl, serviceKey);
    const smtp = getSmtpConfig();

    const markDepositPaid = async (session: Stripe.Checkout.Session) => {
      const metadataBookingId = session.metadata?.booking_id || null;
      const paymentRef = String(session.payment_intent || session.id);
      let bookingId = metadataBookingId;

      if (!bookingId) {
        const { data: fallbackBooking } = await admin
          .from("bookings")
          .select("id")
          .or(`deposit_payment_id.eq.${session.id},deposit_payment_id.eq.${paymentRef}`)
          .limit(1)
          .maybeSingle();
        bookingId = fallbackBooking?.id || null;
      }

      if (!bookingId) return;

      const { data: updatedRows } = await admin
        .from("bookings")
        .update({
          deposit_paid: true,
          deposit_link_sent: true,
          deposit_payment_id: paymentRef,
        } as any)
        .eq("id", bookingId)
        .or("deposit_paid.is.null,deposit_paid.eq.false")
        .select(
          "id, artist_id, client_name, client_email, starts_at, ends_at, booking_type, service_category, status, deposit_amount",
        );
      const paidBooking = updatedRows?.[0] as
        | {
            id: string;
            artist_id: string;
            client_name: string | null;
            client_email: string | null;
            starts_at: string;
            ends_at: string;
            booking_type: string;
            service_category: string | null;
            status: string;
            deposit_amount: number | null;
          }
        | undefined;
      const receiptTo = paidBooking?.client_email || session.customer_details?.email || session.customer_email || null;

      if (paidBooking && receiptTo && smtp) {
        try {
          const { data: artistProfile } = await admin
            .from("profiles")
            .select("display_name")
            .eq("user_id", paidBooking.artist_id)
            .maybeSingle();
          const bookingDetails: BookingEmailDetails = {
            id: paidBooking.id,
            client_name: paidBooking.client_name || "Client",
            client_email: paidBooking.client_email,
            client_phone: null,
            artistName: artistProfile?.display_name || "Artist",
            booking_type: paidBooking.booking_type,
            service_category: paidBooking.service_category,
            status: paidBooking.status || "confirmed",
            starts_at: paidBooking.starts_at,
            ends_at: paidBooking.ends_at,
            deposit_amount: paidBooking.deposit_amount,
            deposit_paid: true,
          };
          const receipt = buildDepositReceiptEmail({
            clientName: paidBooking.client_name || "there",
            startsAt: paidBooking.starts_at,
            amountGbp: Number(paidBooking.deposit_amount ?? 50),
            booking: bookingDetails,
          });
          await sendTransactionalEmail({
            smtp,
            to: receiptTo,
            subject: `Deposit received — ${getShopBranding().shopName}`,
            html: receipt.html,
            attachments: receipt.attachments,
          });
        } catch (receiptError) {
          console.error("Deposit receipt email failed", {
            bookingId: paidBooking.id,
            to: receiptTo,
            error: receiptError instanceof Error ? receiptError.message : String(receiptError),
          });
        }
      }
    };

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      const kind = session.metadata?.kind;

      if (kind === "deposit" || session.metadata?.booking_id || !!session.payment_intent) {
        await markDepositPaid(session);
      }

      if (kind === "invoice" && session.metadata?.invoice_id) {
        await admin
          .from("invoices")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: String(session.payment_intent || ""),
          } as any)
          .eq("id", session.metadata.invoice_id);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(msg, { status: 400 });
  }
});

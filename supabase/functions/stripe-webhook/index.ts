import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { getShopBranding } from "../_shared/branding.ts";
import { getEmailDeliveryStatus, sendTransactionalEmail } from "../_shared/email.ts";
import { buildDepositReceiptEmail, type BookingEmailDetails } from "../_shared/email-templates.ts";
import { resolveEmailLocale, t } from "../_shared/email-i18n.ts";
import { syncConnectAccountFromStripe, syncArtistConnectAccountFromStripe } from "../_shared/stripe-connect.ts";
import { markBookingDepositPaid } from "../_shared/deposit-payment.ts";
import { executePosSplitTransfers } from "../_shared/pos-split-transfers.ts";
import { sendPosReceiptEmailIfNeeded } from "../_shared/pos-receipt-email.ts";
import { getShopPaymentSettings } from "../_shared/shop-currency.ts";
import {
  constructVerifiedStripeEvent,
  createConnectStripe,
  createPlatformStripe,
  getPlatformStripeSecret,
} from "../_shared/stripe-keys.ts";

function mapStripeSubStatus(status: Stripe.Subscription.Status): string {
  const allowed = ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "paused"];
  return allowed.includes(status) ? status : "incomplete";
}

function resolvePlanIdFromPrice(
  priceId: string | null | undefined,
  metadataPlanId: string | null | undefined,
): string {
  if (metadataPlanId && ["starter", "studio", "enterprise"].includes(metadataPlanId)) {
    return metadataPlanId;
  }
  const starterPrice = Deno.env.get("STRIPE_PRICE_STARTER");
  const studioPrice = Deno.env.get("STRIPE_PRICE_STUDIO");
  const enterprisePrice = Deno.env.get("STRIPE_PRICE_ENTERPRISE");
  if (priceId && starterPrice && priceId === starterPrice) return "starter";
  if (priceId && studioPrice && priceId === studioPrice) return "studio";
  if (priceId && enterprisePrice && priceId === enterprisePrice) return "enterprise";
  return "studio";
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const platformStripeSecret = getPlatformStripeSecret();
    const platformWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
    const connectWebhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET") ?? "";
    if (!supabaseUrl || !serviceKey || !platformStripeSecret || (!platformWebhookSecret && !connectWebhookSecret)) {
      return new Response("Server misconfigured", { status: 500 });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) return new Response("Missing stripe-signature", { status: 400 });

    const rawBody = await req.text();
    const { event, source } = await constructVerifiedStripeEvent(rawBody, signature);
    const platformStripe = createPlatformStripe();
    const connectStripe = createConnectStripe();
    const admin = createClient(supabaseUrl, serviceKey);
    const emailReady = getEmailDeliveryStatus();
    const canSendEmail = emailReady.from && (emailReady.resendApi || emailReady.smtp);

    const logSubscriptionEvent = async (orgId: string | null, eventType: string, payload: Record<string, unknown>) => {
      await admin.from("subscription_events").insert({
        organization_id: orgId,
        stripe_event_id: event.id,
        event_type: eventType,
        payload,
      });
    };

    const syncPlatformSubscription = async (subscription: Stripe.Subscription) => {
      const orgId =
        subscription.metadata?.organization_id ||
        (await admin
          .from("organizations")
          .select("id")
          .eq("stripe_customer_id", String(subscription.customer))
          .maybeSingle()).data?.id ||
        null;

      if (!orgId) return;

      const priceId = subscription.items.data[0]?.price?.id ?? null;
      const planId = resolvePlanIdFromPrice(priceId, subscription.metadata?.plan_id);

      await admin.from("platform_subscriptions").upsert(
        {
          organization_id: orgId,
          plan_id: planId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: priceId,
          status: mapStripeSubStatus(subscription.status),
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
          canceled_at: subscription.canceled_at
            ? new Date(subscription.canceled_at * 1000).toISOString()
            : null,
          trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        },
        { onConflict: "organization_id" },
      );

      const orgStatus = ["trialing", "active", "past_due"].includes(subscription.status) ? "active" : "canceled";
      await admin.from("organizations").update({ status: orgStatus }).eq("id", orgId);

      await logSubscriptionEvent(orgId, event.type, {
        subscription_id: subscription.id,
        status: subscription.status,
        plan_id: planId,
      });
    };

    const markDepositPaid = async (session: Stripe.Checkout.Session) => {
      const { bookingId, newlyMarkedPaid } = await markBookingDepositPaid(admin, session);
      if (!bookingId) return;

      const { data: paidBookingRow } = await admin
        .from("bookings")
        .select(
          "id, artist_id, client_user_id, client_name, client_email, starts_at, ends_at, booking_type, service_category, status, deposit_amount, deposit_paid",
        )
        .eq("id", bookingId)
        .maybeSingle();
      if (!newlyMarkedPaid && !paidBookingRow?.deposit_paid) return;

      const paidBooking = paidBookingRow as
        | {
            id: string;
            artist_id: string;
            client_user_id?: string | null;
            client_name: string | null;
            client_email: string | null;
            starts_at: string;
            ends_at: string;
            booking_type: string;
            service_category: string | null;
            status: string;
            deposit_amount: number | null;
          }
        | null;
      const receiptTo = paidBooking?.client_email || session.customer_details?.email || session.customer_email || null;

      if (newlyMarkedPaid && paidBooking && receiptTo && canSendEmail) {
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
          const orgId = session.metadata?.organization_id ?? null;
          const locale = await resolveEmailLocale(admin, {
            recipientUserId: paidBooking.client_user_id ?? null,
            organizationId: orgId,
          });
          const { currency: shopCurrency } = await getShopPaymentSettings(admin, orgId);
          const receipt = buildDepositReceiptEmail({
            clientName: paidBooking.client_name || "there",
            startsAt: paidBooking.starts_at,
            amount: Number(paidBooking.deposit_amount ?? 50),
            currency: shopCurrency,
            booking: bookingDetails,
            locale,
          });
          await sendTransactionalEmail({
            to: receiptTo,
            subject: t(locale, "subjects.deposit.receipt", { shopName: getShopBranding().shopName }),
            html: receipt.html,
            attachments: receipt.attachments,
            fromKind: "booking",
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

      if (kind === "platform_subscription" && session.mode === "subscription") {
        const orgId = session.metadata?.organization_id ?? null;
        if (session.subscription && orgId) {
          const subscription = await platformStripe.subscriptions.retrieve(String(session.subscription));
          await syncPlatformSubscription(subscription);
        }
      }

      if (kind === "deposit" || session.metadata?.booking_id || !!session.payment_intent) {
        if (kind !== "platform_subscription") {
          await markDepositPaid(session);
        }
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

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      await syncPlatformSubscription(subscription);
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        const subscription = await platformStripe.subscriptions.retrieve(String(invoice.subscription));
        await syncPlatformSubscription(subscription);
      }
    }

    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      if (account.id) {
        if (account.metadata?.velbok_kind === "pos_artist") {
          await syncArtistConnectAccountFromStripe(admin, connectStripe, account.id);
        } else {
          await syncConnectAccountFromStripe(admin, connectStripe, account.id);
        }
      }
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.kind === "deposit" && pi.metadata?.booking_id) {
        await markDepositPaid({
          id: pi.id,
          payment_intent: pi.id,
          metadata: pi.metadata,
          customer_email: pi.receipt_email,
        } as Stripe.Checkout.Session);
      } else if (pi.metadata?.kind === "pos" && pi.metadata?.pos_sale_id) {
        await admin
          .from("pos_sales")
          .update({ status: "succeeded", stripe_payment_intent_id: pi.id })
          .eq("id", pi.metadata.pos_sale_id)
          .eq("status", "pending");

        const transferResult = await executePosSplitTransfers({
          admin,
          stripe: connectStripe,
          saleId: pi.metadata.pos_sale_id,
          paymentIntentId: pi.id,
          stripeConnectAccountId: pi.metadata?.shop_connect_account_id ?? null,
        });
        if (transferResult.errors.length) {
          console.error("POS split transfer errors", {
            saleId: pi.metadata.pos_sale_id,
            paymentIntentId: pi.id,
            errors: transferResult.errors,
          });
        }

        const receiptResult = await sendPosReceiptEmailIfNeeded(admin, pi.metadata.pos_sale_id);
        if (receiptResult.error) {
          console.error("POS receipt email failed from webhook", {
            saleId: pi.metadata.pos_sale_id,
            error: receiptResult.error,
          });
        }
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import nodemailer from "npm:nodemailer@6.9.15";
import { emailBrandHeader, getShopBranding } from "../_shared/branding.ts";

async function sendDepositReceiptEmail(params: {
  host: string | null;
  port: string | null;
  username: string | null;
  password: string | null;
  from: string | null;
  to: string;
  clientName: string;
  startsAt: string;
  amountGbp: number;
}) {
  const { host, port, username, password, from, to, clientName, startsAt, amountGbp } = params;
  if (!host || !port || !username || !password || !from) return;
  const portNum = Number(port);
  if (!Number.isFinite(portNum)) return;
  const transporter = nodemailer.createTransport({
    host,
    port: portNum,
    secure: portNum === 465,
    auth: { user: username, pass: password },
    requireTLS: portNum !== 465,
  });
  const bookingDate = new Date(startsAt).toLocaleString("en-GB", { timeZone: "Europe/London" });
  const safeName = clientName || "there";
  const brand = getShopBranding();
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#1f1f1f;background:#f2f2f2;padding:28px 12px;">
      <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e7e7e7;border-radius:12px;overflow:hidden;">
        <div style="background:#121212;padding:20px 24px;text-align:center;">
          ${emailBrandHeader(brand)}
          <div style="font-size:13px;color:#d4d4d4;margin-top:4px;">Deposit Payment Confirmation</div>
        </div>
        <div style="padding:22px;">
          <p style="margin:0 0 12px;font-size:15px;">Hi ${safeName},</p>
          <p style="margin:0 0 14px;font-size:14px;">We've received your deposit payment of <strong>£${amountGbp.toFixed(2)}</strong>.</p>
          <p style="margin:0 0 12px;font-size:14px;">Booking date: <strong>${bookingDate}</strong></p>
          <p style="margin:0;font-size:13px;color:#555;">Thanks for securing your session. If you have any questions, reply to this email.</p>
        </div>
      </div>
    </div>
  `;
  await transporter.sendMail({
    from,
    to,
    subject: `Deposit received — ${brand.shopName}`,
    html,
  });
}

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
    const smtpHost = Deno.env.get("SMTP_HOST") ?? null;
    const smtpPort = Deno.env.get("SMTP_PORT") ?? null;
    const smtpUser = Deno.env.get("SMTP_USER") ?? null;
    const smtpPass = Deno.env.get("SMTP_PASS") ?? Deno.env.get("SMTP_PASSWORD") ?? null;
    const emailFrom = Deno.env.get("EMAIL_FROM") ?? Deno.env.get("SMTP_FROM") ?? null;

    const markDepositPaid = async (session: Stripe.Checkout.Session) => {
      const metadataBookingId = session.metadata?.booking_id || null;
      const paymentRef = String(session.payment_intent || session.id);
      let bookingId = metadataBookingId;

      // Fallback for legacy sessions or manually-created Stripe sessions with missing metadata.
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
        .select("id, client_name, client_email, starts_at, deposit_amount");
      const paidBooking = updatedRows?.[0] as
        | { id: string; client_name: string | null; client_email: string | null; starts_at: string; deposit_amount: number | null }
        | undefined;
      const receiptTo = paidBooking?.client_email || session.customer_details?.email || session.customer_email || null;

      if (paidBooking && receiptTo) {
        try {
          await sendDepositReceiptEmail({
            host: smtpHost,
            port: smtpPort,
            username: smtpUser,
            password: smtpPass,
            from: emailFrom,
            to: receiptTo,
            clientName: paidBooking.client_name || "there",
            startsAt: paidBooking.starts_at,
            amountGbp: Number(paidBooking.deposit_amount ?? 50),
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

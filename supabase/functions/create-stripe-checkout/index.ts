import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { getShopBranding } from "../_shared/branding.ts";
import { getEmailDeliveryStatus, requireEmailDeliveryConfig, sendTransactionalEmail } from "../_shared/email.ts";
import {
  buildDepositReceiptEmail,
  buildDepositRequestEmail,
  type BookingEmailDetails,
} from "../_shared/email-templates.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseBearerJwt(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1].trim() : null;
}

type CheckoutType = "deposit" | "invoice";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!supabaseUrl || !serviceKey || !stripeSecret) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = parseBearerJwt(req);
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized", reason: "missing_bearer_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const emailReady = getEmailDeliveryStatus();
    const canSendEmail = emailReady.from && (emailReady.resendApi || emailReady.smtp);

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized", reason: "invalid_or_expired_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "artist"]);
    let isStaff = (roleRows || []).length > 0;
    if (!isStaff) {
      const [depRes, billRes] = await Promise.all([
        admin.rpc("has_permission", { _user_id: user.id, _feature: "deposits" }),
        admin.rpc("has_permission", { _user_id: user.id, _feature: "billing" }),
      ]);
      isStaff = !!(depRes.data || billRes.data);
    }

    const body = await req.json().catch(() => ({}));
    const type = body.type === "invoice" ? "invoice" : body.type === "deposit" ? "deposit" : null;
    const bookingId = typeof body.bookingId === "string" ? body.bookingId : null;
    const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : null;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const action = body.action === "confirm" ? "confirm" : "create";
    const sendEmail = body.sendEmail === true;
    if (!type) {
      return new Response(JSON.stringify({ error: "type must be deposit or invoice" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecret);
    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "http://localhost:5173";
    const baseUrl = origin.replace(/\/$/, "");

    if (type === "deposit") {
      if (!bookingId) {
        return new Response(JSON.stringify({ error: "bookingId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: booking, error } = await admin
        .from("bookings")
        .select("id, artist_id, client_user_id, client_name, client_email, starts_at, ends_at, booking_type, service_category, status, deposit_amount, deposit_paid, vip_client")
        .eq("id", bookingId)
        .single();
      if (error || !booking) {
        return new Response(JSON.stringify({ error: error?.message || "Booking not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isStaff && booking.client_user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (booking.deposit_paid) {
        return new Response(JSON.stringify({ error: "Deposit already paid" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (booking.vip_client) {
        return new Response(JSON.stringify({ error: "VIP booking does not require deposit" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "confirm") {
        if (!sessionId) {
          return new Response(JSON.stringify({ error: "sessionId is required for confirm" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const sessionBookingId = session.metadata?.booking_id || null;
        const paid =
          session.mode === "payment" &&
          (session.payment_status === "paid" || session.status === "complete") &&
          session.metadata?.kind === "deposit" &&
          sessionBookingId === booking.id;
        if (!paid) {
          return new Response(
            JSON.stringify({
              ok: false,
              confirmed: false,
              paymentStatus: session.payment_status || null,
              sessionStatus: session.status || null,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const { data: updatedRows } = await admin
          .from("bookings")
          .update({
            deposit_paid: true,
            deposit_link_sent: true,
            deposit_payment_id: String(session.payment_intent || session.id),
          } as any)
          .eq("id", booking.id)
          .or("deposit_paid.is.null,deposit_paid.eq.false")
          .select("id")
          .limit(1);
        const newlyMarkedPaid = (updatedRows?.length || 0) > 0;
        const receiptTo = booking.client_email || session.customer_details?.email || session.customer_email || null;
        if (newlyMarkedPaid && receiptTo && canSendEmail) {
          try {
            const { data: artistProfile } = await admin
              .from("profiles")
              .select("display_name")
              .eq("user_id", booking.artist_id)
              .maybeSingle();
            const bookingDetails: BookingEmailDetails = {
              id: booking.id,
              client_name: booking.client_name,
              client_email: booking.client_email,
              client_phone: null,
              artistName: artistProfile?.display_name || "Artist",
              booking_type: booking.booking_type,
              service_category: booking.service_category,
              status: booking.status || "confirmed",
              starts_at: booking.starts_at,
              ends_at: booking.ends_at,
              deposit_amount: booking.deposit_amount,
              deposit_paid: true,
            };
            const receipt = buildDepositReceiptEmail({
              clientName: booking.client_name || "there",
              startsAt: booking.starts_at,
              amountGbp: Number(booking.deposit_amount ?? 50),
              booking: bookingDetails,
            });
            await sendTransactionalEmail({
              to: receiptTo,
              subject: `Deposit received — ${getShopBranding().shopName}`,
              html: receipt.html,
              attachments: receipt.attachments,
              fromKind: "booking",
            });
          } catch (receiptError) {
            console.error("Deposit receipt email failed from confirm flow", {
              bookingId: booking.id,
              to: receiptTo,
              error: receiptError instanceof Error ? receiptError.message : String(receiptError),
            });
          }
        }
        return new Response(
          JSON.stringify({
            ok: true,
            confirmed: true,
            bookingId: booking.id,
            paymentIntentId: String(session.payment_intent || session.id),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const amountPence = Math.round(Number(booking.deposit_amount ?? 50) * 100);
      if (amountPence < 30) {
        return new Response(JSON.stringify({ error: "Deposit amount is too small for online checkout (minimum £0.30)." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${baseUrl}/deposit-payment?status=success&bookingId=${booking.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/deposit-payment/checkout?bookingId=${booking.id}&status=cancel`,
        customer_email: booking.client_email || user.email || undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              product_data: {
                name: `Deposit - ${booking.client_name}`,
                description: `Booking on ${new Date(booking.starts_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}`,
              },
              unit_amount: amountPence,
            },
          },
        ],
        metadata: {
          kind: "deposit",
          booking_id: booking.id,
        },
      });

      await admin
        .from("bookings")
        .update({
          deposit_link_sent: true,
          deposit_payment_id: session.id,
        } as any)
        .eq("id", booking.id);

      let emailSent = false;
      let emailError: string | null = null;
      if (sendEmail) {
        if (!booking.client_email) {
          emailError = "Booking has no client email";
        } else if (!session.url) {
          emailError = "Checkout URL missing";
        } else {
          try {
            requireEmailDeliveryConfig();
            const html = buildDepositRequestEmail({
              clientName: booking.client_name,
              startsAt: booking.starts_at,
              checkoutUrl: session.url,
              depositAmount: booking.deposit_amount,
            });
            await sendTransactionalEmail({
              to: booking.client_email,
              subject: `Deposit payment reminder — ${getShopBranding().shopName}`,
              html,
              fromKind: "booking",
            });
            emailSent = true;
          } catch (mailErr) {
            emailError = mailErr instanceof Error ? mailErr.message : "Failed to send email";
          }
        }
      }

      return new Response(
        JSON.stringify({
          ok: !sendEmail || emailSent,
          checkoutUrl: session.url,
          checkoutSessionId: session.id,
          emailAttempted: sendEmail,
          emailSent,
          emailError,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoiceId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invoice, error } = await admin
      .from("invoices")
      .select("id, client_email, client_name, invoice_number, total, status")
      .eq("id", invoiceId)
      .single();
    if (error || !invoice) {
      return new Response(JSON.stringify({ error: error?.message || "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailMatches = !!invoice.client_email && !!user.email && invoice.client_email.toLowerCase() === user.email.toLowerCase();
    if (!isStaff && !emailMatches) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (invoice.status === "paid") {
      return new Response(JSON.stringify({ error: "Invoice already paid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountPence = Math.round(Number(invoice.total ?? 0) * 100);
    if (amountPence < 30) {
      return new Response(JSON.stringify({ error: "Invoice total is too small for online checkout (minimum £0.30)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${baseUrl}/account?invoice=success&invoiceId=${invoice.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/account?invoice=cancel&invoiceId=${invoice.id}`,
      customer_email: invoice.client_email || user.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
              description: `${getShopBranding().shopName} - ${invoice.client_name}`,
            },
            unit_amount: amountPence,
          },
        },
      ],
      metadata: {
        kind: "invoice",
        invoice_id: invoice.id,
      },
    });

    await admin
      .from("invoices")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_checkout_url: session.url,
      } as any)
      .eq("id", invoice.id);

    return new Response(
      JSON.stringify({
        ok: true,
        checkoutUrl: session.url,
        checkoutSessionId: session.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

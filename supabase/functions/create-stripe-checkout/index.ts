import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import nodemailer from "npm:nodemailer@6.9.15";
import { emailBrandHeader, emailSupportLine, getShopBranding } from "../_shared/branding.ts";

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

async function sendDepositEmail(params: {
  host: string | null;
  port: string | null;
  username: string | null;
  password: string | null;
  from: string | null;
  to: string;
  clientName: string;
  startsAt: string;
  checkoutUrl: string;
}) {
  const { host, port, username, password, from, to, clientName, startsAt, checkoutUrl } = params;
  if (!host || !port || !username || !password || !from) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM.");
  }
  const portNum = Number(port);
  if (!Number.isFinite(portNum)) throw new Error("SMTP_PORT must be a number.");

  const transporter = nodemailer.createTransport({
    host,
    port: portNum,
    secure: portNum === 465,
    auth: { user: username, pass: password },
    requireTLS: portNum !== 465,
  });

  const brand = getShopBranding();
  const bookingDate = new Date(startsAt).toLocaleString("en-GB", { timeZone: "Europe/London" });
  const safeName = clientName || "there";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#1f1f1f;background:#f2f2f2;padding:28px 12px;">
      <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e7e7e7;border-radius:12px;overflow:hidden;">
        <div style="background:#121212;padding:20px 24px;text-align:center;">
          ${emailBrandHeader(brand)}
          <div style="font-size:13px;color:#d4d4d4;margin-top:4px;">Deposit Payment Reminder</div>
        </div>
        <div style="padding:22px;">
          <p style="margin:0 0 12px;font-size:15px;">Hi ${safeName},</p>
          <p style="margin:0 0 14px;font-size:14px;">Your session on <strong>${bookingDate}</strong> has a pending deposit. Please use the secure link below to complete payment.</p>
          <p style="margin:18px 0;">
            <a href="${checkoutUrl}" style="display:inline-block;background:#f4c24d;color:#121212;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px;">Pay deposit securely</a>
          </p>
          <p style="margin:8px 0 0;font-size:12px;color:#5c5c5c;">If the button does not work, copy this link: <a href="${checkoutUrl}">${checkoutUrl}</a></p>
          ${emailSupportLine(brand)}
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject: `Deposit payment reminder — ${brand.shopName}`,
    html,
  });
}

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
  if (!host || !port || !username || !password || !from) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM.");
  }
  const portNum = Number(port);
  if (!Number.isFinite(portNum)) throw new Error("SMTP_PORT must be a number.");
  const transporter = nodemailer.createTransport({
    host,
    port: portNum,
    secure: portNum === 465,
    auth: { user: username, pass: password },
    requireTLS: portNum !== 465,
  });

  const brand = getShopBranding();
  const bookingDate = new Date(startsAt).toLocaleString("en-GB", { timeZone: "Europe/London" });
  const safeName = clientName || "there";
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
    const smtpHost = Deno.env.get("SMTP_HOST") ?? null;
    const smtpPort = Deno.env.get("SMTP_PORT") ?? null;
    const smtpUser = Deno.env.get("SMTP_USER") ?? null;
    const smtpPass = Deno.env.get("SMTP_PASS") ?? Deno.env.get("SMTP_PASSWORD") ?? null;
    const emailFrom = Deno.env.get("EMAIL_FROM") ?? Deno.env.get("SMTP_FROM") ?? null;

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
        .select("id, client_user_id, client_name, client_email, starts_at, deposit_amount, deposit_paid, vip_client")
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
        if (newlyMarkedPaid && receiptTo) {
          try {
            await sendDepositReceiptEmail({
              host: smtpHost,
              port: smtpPort,
              username: smtpUser,
              password: smtpPass,
              from: emailFrom,
              to: receiptTo,
              clientName: booking.client_name || "there",
              startsAt: booking.starts_at,
              amountGbp: Number(booking.deposit_amount ?? 50),
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
            await sendDepositEmail({
              host: smtpHost,
              port: smtpPort,
              username: smtpUser,
              password: smtpPass,
              from: emailFrom,
              to: booking.client_email,
              clientName: booking.client_name,
              startsAt: booking.starts_at,
              checkoutUrl: session.url,
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

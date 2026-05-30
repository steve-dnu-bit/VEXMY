import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { getShopBranding } from "../_shared/branding.ts";
import { requireEmailDeliveryConfig, sendTransactionalEmail } from "../_shared/email.ts";
import { buildInvoiceEmail } from "../_shared/email-templates.ts";

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

function toCurrency(n: number): string {
  return `£${Number(n).toFixed(2)}`;
}

async function createInvoiceCheckoutUrl(params: {
  stripeSecret: string;
  invoice: {
    id: string;
    invoice_number: string;
    client_name: string;
    client_email: string | null;
    total: number;
  };
}) {
  const { stripeSecret, invoice } = params;
  const brand = getShopBranding();
  const stripe = new Stripe(stripeSecret);
  const baseUrl = (Deno.env.get("SITE_URL") || "http://localhost:5173").replace(/\/$/, "");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${baseUrl}/account?invoice=success&invoiceId=${invoice.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/account?invoice=cancel&invoiceId=${invoice.id}`,
    customer_email: invoice.client_email || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          product_data: {
            name: `Invoice ${invoice.invoice_number}`,
            description: `${brand.shopName} - ${invoice.client_name}`,
          },
          unit_amount: Math.round(Number(invoice.total || 0) * 100),
        },
      },
    ],
    metadata: {
      kind: "invoice",
      invoice_id: invoice.id,
    },
  });
  return { url: session.url, id: session.id };
}

async function buildInvoicePdf(params: {
  invoiceNumber: string;
  clientName: string;
  dueText: string;
  issueText: string;
  clientEmail: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentMethodLabel: string;
  paymentTermLabel: string;
  notes: string | null;
  items: Array<{ description: string; quantity: number; unit_price: number }>;
}): Promise<string> {
  const brand = getShopBranding();
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 800;

  const draw = (text: string, size = 11, bold = false, color = rgb(0.15, 0.15, 0.15), x = 50) => {
    page.drawText(text, { x, y, size, font: bold ? fontBold : font, color });
    y -= size + 6;
  };

  // Branded top bar
  page.drawRectangle({
    x: 0,
    y: 795,
    width: 595,
    height: 47,
    color: rgb(0.08, 0.08, 0.08),
  });
  y = 812;
  draw(brand.shopName.toUpperCase(), 18, true, rgb(0.95, 0.76, 0.27), 50);
  draw("INVOICE", 10, true, rgb(0.85, 0.85, 0.85), 490);
  y = 760;
  draw(`Invoice #: ${params.invoiceNumber}`, 12, true);
  draw(`Issue date: ${params.issueText}`, 10, false, rgb(0.35, 0.35, 0.35));
  draw(`Due date: ${params.dueText}`, 10, false, rgb(0.35, 0.35, 0.35));
  draw(`Legal name: ${brand.legalName}`, 10, false, rgb(0.35, 0.35, 0.35));
  draw(`Trading name: ${brand.tradingName}`, 10, false, rgb(0.35, 0.35, 0.35));
  y -= 6;

  page.drawRectangle({
    x: 50,
    y: y - 56,
    width: 495,
    height: 56,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.88, 0.88, 0.88),
    borderWidth: 1,
  });
  draw("Bill to", 10, true, rgb(0.25, 0.25, 0.25), 58);
  draw(`${params.clientName}`, 11, true, rgb(0.1, 0.1, 0.1), 58);
  if (params.clientEmail) draw(params.clientEmail, 10, false, rgb(0.4, 0.4, 0.4), 58);
  y -= 10;

  page.drawRectangle({
    x: 50,
    y: y - 44,
    width: 495,
    height: 44,
    color: rgb(1, 0.985, 0.95),
    borderColor: rgb(0.93, 0.82, 0.56),
    borderWidth: 1,
  });
  draw(`Payment method: ${params.paymentMethodLabel}`, 10, true, rgb(0.32, 0.24, 0.1), 58);
  draw(`Payment option: ${params.paymentTermLabel}`, 10, false, rgb(0.32, 0.24, 0.1), 58);
  y -= 14;

  draw("Itemized charges", 12, true);
  draw("Description                                         Qty     Unit price       Line total", 9, true, rgb(0.4, 0.4, 0.4));
  for (const item of params.items) {
    const description = item.description.length > 44 ? `${item.description.slice(0, 41)}...` : item.description;
    const qty = String(item.quantity).padStart(2, " ");
    const unit = toCurrency(item.unit_price).padStart(9, " ");
    const lineTotal = toCurrency(item.quantity * item.unit_price).padStart(9, " ");
    const line = `${description.padEnd(50, " ")}${qty}     ${unit}       ${lineTotal}`;
    draw(line, 10);
    if (y < 100) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
  }
  y -= 6;
  page.drawRectangle({
    x: 330,
    y: y - 62,
    width: 215,
    height: 62,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.88, 0.88, 0.88),
    borderWidth: 1,
  });
  draw(`Subtotal: ${toCurrency(params.subtotal)}`, 10, false, rgb(0.25, 0.25, 0.25), 342);
  draw(`VAT: ${toCurrency(params.taxAmount)}`, 10, false, rgb(0.25, 0.25, 0.25), 342);
  draw(`Total due: ${toCurrency(params.total)}`, 12, true, rgb(0.06, 0.06, 0.06), 342);
  if (params.notes) {
    y -= 6;
    draw("Notes:", 11, true);
    draw(params.notes, 10);
  }
  y -= 12;
  draw(`Thanks for choosing ${brand.shopName}.`, 10, true);
  draw(`Please use ${params.invoiceNumber} as payment reference.`, 9, false, rgb(0.35, 0.35, 0.35));
  if (brand.supportEmail) draw(`Questions? ${brand.supportEmail}`, 9, false, rgb(0.35, 0.35, 0.35));

  const bytes = await pdf.save();
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : "";
    const action = typeof body.action === "string" ? body.action : "send";
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoiceId is required" }), {
        status: 400,
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
    const { data: authData, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized", reason: "invalid_or_expired_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: staffRows } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .in("role", ["admin", "artist"]);
    let canSendInvoice = (staffRows || []).length > 0;
    if (!canSendInvoice) {
      const { data: billingPerm } = await adminClient.rpc("has_permission", {
        _user_id: authData.user.id,
        _feature: "billing",
      });
      canSendInvoice = !!billingPerm;
    }
    if (!canSendInvoice) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invoice, error: invoiceErr } = await adminClient
      .from("invoices")
      .select("id, invoice_number, client_name, client_email, due_date, subtotal, tax_amount, total, notes, payment_method, payment_term, items")
      .eq("id", invoiceId)
      .single();

    if (invoiceErr || !invoice) {
      return new Response(JSON.stringify({ error: invoiceErr?.message || "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!invoice.client_email) {
      return new Response(JSON.stringify({ error: "Invoice has no client email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    requireEmailDeliveryConfig();

    const issueText = new Date().toLocaleDateString("en-GB");
    const dueText = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("en-GB") : "N/A";
    const paymentMethodLabel =
      invoice.payment_method === "bank_transfer"
        ? "Bank transfer"
        : invoice.payment_method === "cash"
          ? "Cash"
          : "Card";
    const paymentTermLabel = invoice.payment_term === "paid_in_full" ? "Paid in full" : "Due";
    const firstName = (invoice.client_name || "").trim().split(/\s+/)[0] || "there";
    const itemRows = Array.isArray(invoice.items) ? invoice.items : [];
    const parsedItems = itemRows.map((r: any) => ({
      description: String(r?.description || "Service"),
      quantity: Number(r?.quantity || 1),
      unit_price: Number(r?.unit_price || 0),
    }));

    // Stripe pay-link is optional: never block invoice email/PDF if checkout fails (bad key, £0 total, DB column drift, etc.)
    let payUrl: string | null = null;
    if (stripeSecret && action !== "pdf" && invoice.payment_method === "card" && invoice.payment_term === "due") {
      const totalPence = Math.round(Number(invoice.total || 0) * 100);
      if (totalPence >= 30) {
        try {
          const checkout = await createInvoiceCheckoutUrl({
            stripeSecret,
            invoice: {
              id: invoice.id,
              invoice_number: invoice.invoice_number,
              client_name: invoice.client_name,
              client_email: invoice.client_email,
              total: Number(invoice.total),
            },
          });
          payUrl = checkout.url || null;
          await adminClient
            .from("invoices")
            .update({
              stripe_checkout_session_id: checkout.id,
              stripe_checkout_url: checkout.url,
            } as any)
            .eq("id", invoice.id);
        } catch (stripeErr) {
          console.error("send-invoice: Stripe checkout or DB update failed; continuing without pay link:", stripeErr);
        }
      }
    }

    const brand = getShopBranding();
    const html = buildInvoiceEmail({
      clientFirstName: firstName,
      invoiceNumber: invoice.invoice_number,
      issueText,
      dueText,
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.tax_amount),
      total: Number(invoice.total),
      paymentMethodLabel,
      paymentTermLabel,
      notes: invoice.notes,
      payUrl,
    });

    const pdfBase64 = await buildInvoicePdf({
      invoiceNumber: invoice.invoice_number,
      clientName: invoice.client_name,
      dueText,
      issueText,
      clientEmail: invoice.client_email,
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.tax_amount),
      total: Number(invoice.total),
      paymentMethodLabel,
      paymentTermLabel,
      notes: invoice.notes,
      items: parsedItems,
    });

    if (action === "pdf") {
      return new Response(
        JSON.stringify({
          ok: true,
          filename: `${invoice.invoice_number}.pdf`,
          pdfBase64,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let emailSent = false;
    let emailError: string | null = null;
    try {
      await sendTransactionalEmail({
        to: invoice.client_email,
        subject: `Invoice ${invoice.invoice_number} — ${brand.shopName}`,
        html,
        attachments: [
          {
            filename: `${invoice.invoice_number}.pdf`,
            content: pdfBase64,
            encoding: "base64",
            contentType: "application/pdf",
          },
        ],
      });
      emailSent = true;
    } catch (mailErr) {
      emailError = mailErr instanceof Error ? mailErr.message : "Failed to send invoice email";
    }

    return new Response(JSON.stringify({ ok: emailSent, emailAttempted: true, emailSent, emailError, payUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


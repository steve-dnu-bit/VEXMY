import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getShopBrandingForBooking } from "./branding.ts";
import { buildPosReceiptEmail, buildPosCancelNoticeEmail } from "./email-templates.ts";
import { emailLocaleToIntlDateLocale, resolveEmailLocale, t, type EmailLanguage } from "./email-i18n.ts";
import { getEmailDeliveryStatus, sendTransactionalEmail } from "./email.ts";
import { buildPosReceiptPdf, type PosReceiptLineItem } from "./pos-receipt-pdf.ts";
import { formatShopMoney } from "./shop-currency.ts";

function isValidEmail(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parseLineItems(raw: unknown): PosReceiptLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const quantity = Number(row.quantity) || 1;
      const unitPrice = Number(row.unitPrice ?? row.unit_price) || 0;
      const lineTotal = Number(row.lineTotal ?? row.line_total) || Math.round(unitPrice * quantity * 100) / 100;
      const name = String(row.name || "Item").trim();
      if (!name) return null;
      return { name, quantity, unitPrice, lineTotal };
    })
    .filter((item): item is PosReceiptLineItem => item !== null);
}

export type PosReceiptSendResult = {
  sent: boolean;
  skipped?: string;
  error?: string;
};

export async function sendPosReceiptEmailIfNeeded(
  admin: SupabaseClient,
  saleId: string,
): Promise<PosReceiptSendResult> {
  const emailConfig = getEmailDeliveryStatus();
  if (!emailConfig.from || (!emailConfig.resendApi && !emailConfig.smtp)) {
    return { sent: false, skipped: "email_not_configured" };
  }

  const { data: sale } = await admin
    .from("pos_sales")
    .select(
      "id, organization_id, artist_id, client_name, client_email, booking_id, items, currency, subtotal, tax_amount, gratuity_amount, session_total, deposit_credit_amount, total, shop_split_percent, artist_split_percent, status, created_at, receipt_email_sent_at",
    )
    .eq("id", saleId)
    .maybeSingle();

  if (!sale || sale.status !== "succeeded") {
    return { sent: false, skipped: "sale_not_succeeded" };
  }
  if (sale.receipt_email_sent_at) {
    return { sent: false, skipped: "already_sent" };
  }

  let clientEmail = sale.client_email?.trim().toLowerCase() || null;
  let bookingClientUserId: string | null = null;

  if (!isValidEmail(clientEmail) && sale.booking_id) {
    const { data: booking } = await admin
      .from("bookings")
      .select("client_email, client_user_id")
      .eq("id", sale.booking_id)
      .maybeSingle();
    bookingClientUserId = booking?.client_user_id ?? null;
    const bookingEmail = booking?.client_email?.trim().toLowerCase() || null;
    if (isValidEmail(bookingEmail)) clientEmail = bookingEmail;
  }

  if (!isValidEmail(clientEmail)) {
    return { sent: false, skipped: "no_client_email" };
  }

  const { data: artistProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("user_id", sale.artist_id)
    .maybeSingle();
  const artistName = artistProfile?.display_name?.trim() || "Artist";

  const { data: shopSettings } = await admin
    .from("shop_settings")
    .select("tax_label, country_code")
    .eq("organization_id", sale.organization_id)
    .maybeSingle();
  const taxLabel = shopSettings?.tax_label?.trim() || "VAT";

  const locale: EmailLanguage = await resolveEmailLocale(admin, {
    recipientUserId: bookingClientUserId,
    organizationId: sale.organization_id,
  });

  const brand = await getShopBrandingForBooking(admin, {
    organizationId: sale.organization_id,
    artistId: sale.artist_id,
  });
  const intlLocale = emailLocaleToIntlDateLocale(locale);
  const paidAt = new Date(sale.created_at);
  const paidAtText = paidAt.toLocaleString(intlLocale, { timeZone: "Europe/London" });
  const receiptNumber = sale.id.slice(0, 8).toUpperCase();
  const clientName = sale.client_name?.trim() || "Guest";
  const items = parseLineItems(sale.items);
  const sessionTotal = Number(sale.session_total ?? sale.total) || 0;
  const amountPaid = Number(sale.total) || 0;
  const currency = sale.currency || "gbp";
  const fmt = (n: number) => formatShopMoney(n, currency);
  const paymentMethodLabel = t(locale, "posReceipt.paymentMethod.card");

  const pdfBase64 = await buildPosReceiptPdf({
    receiptNumber,
    clientName,
    clientEmail,
    artistName,
    paidAtText,
    currency,
    taxLabel,
    items,
    subtotal: Number(sale.subtotal) || 0,
    taxAmount: Number(sale.tax_amount) || 0,
    gratuityAmount: Number(sale.gratuity_amount) || 0,
    sessionTotal,
    depositCreditAmount: Number(sale.deposit_credit_amount) || 0,
    amountPaid,
    paymentMethodLabel,
    brand,
  });

  const html = buildPosReceiptEmail({
    brand,
    locale,
    clientName,
    artistName,
    receiptNumber,
    paidAtText,
    amountPaidText: fmt(amountPaid),
    sessionTotalText: fmt(sessionTotal),
    depositCreditText: Number(sale.deposit_credit_amount) > 0 ? fmt(Number(sale.deposit_credit_amount)) : null,
  });

  try {
    await sendTransactionalEmail({
      to: clientEmail,
      subject: t(locale, "subjects.posReceipt.default", { shopName: brand.shopName, receiptNumber }),
      html,
      attachments: [{
        filename: `receipt-${receiptNumber}.pdf`,
        content: pdfBase64,
        contentType: "application/pdf",
        encoding: "base64",
      }],
      fromKind: "booking",
      fromDisplayName: brand.shopName,
      replyTo: brand.supportEmail ?? undefined,
    });

    await admin
      .from("pos_sales")
      .update({ receipt_email_sent_at: new Date().toISOString(), client_email: clientEmail })
      .eq("id", saleId)
      .is("receipt_email_sent_at", null);

    return { sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send receipt email";
    console.error("POS receipt email failed", { saleId, clientEmail, message });
    return { sent: false, error: message };
  }
}

/** Short notice when a Terminal payment was cancelled or failed — no charge taken. */
export async function sendPosCancelledNoticeEmailIfNeeded(
  admin: SupabaseClient,
  saleId: string,
): Promise<PosReceiptSendResult> {
  const emailConfig = getEmailDeliveryStatus();
  if (!emailConfig.from || (!emailConfig.resendApi && !emailConfig.smtp)) {
    return { sent: false, skipped: "email_not_configured" };
  }

  const { data: sale } = await admin
    .from("pos_sales")
    .select(
      "id, organization_id, artist_id, client_name, client_email, booking_id, currency, total, status, created_at, receipt_email_sent_at",
    )
    .eq("id", saleId)
    .maybeSingle();

  if (!sale || (sale.status !== "cancelled" && sale.status !== "failed")) {
    return { sent: false, skipped: "sale_not_cancelled" };
  }
  if (sale.receipt_email_sent_at) {
    return { sent: false, skipped: "already_sent" };
  }

  let clientEmail = sale.client_email?.trim().toLowerCase() || null;
  let bookingClientUserId: string | null = null;

  if (!isValidEmail(clientEmail) && sale.booking_id) {
    const { data: booking } = await admin
      .from("bookings")
      .select("client_email, client_user_id")
      .eq("id", sale.booking_id)
      .maybeSingle();
    bookingClientUserId = booking?.client_user_id ?? null;
    const bookingEmail = booking?.client_email?.trim().toLowerCase() || null;
    if (isValidEmail(bookingEmail)) clientEmail = bookingEmail;
  }

  if (!isValidEmail(clientEmail)) {
    return { sent: false, skipped: "no_client_email" };
  }

  const brand = await getShopBrandingForBooking(admin, {
    organizationId: sale.organization_id,
    artistId: sale.artist_id,
  });
  const locale: EmailLanguage = await resolveEmailLocale(admin, {
    recipientUserId: bookingClientUserId,
    organizationId: sale.organization_id,
  });
  const receiptNumber = sale.id.slice(0, 8).toUpperCase();
  const clientName = sale.client_name?.trim() || "Guest";
  const amountText = formatShopMoney(Number(sale.total) || 0, sale.currency || "gbp");
  const cancelled = sale.status === "cancelled";

  const html = buildPosCancelNoticeEmail({
    brand,
    locale,
    clientName,
    receiptNumber,
    amountText,
    cancelled,
  });

  try {
    await sendTransactionalEmail({
      to: clientEmail,
      subject: cancelled
        ? t(locale, "subjects.posCancelNotice.cancelled", { shopName: brand.shopName, receiptNumber })
        : t(locale, "subjects.posCancelNotice.failed", { shopName: brand.shopName, receiptNumber }),
      html,
      fromKind: "booking",
      fromDisplayName: brand.shopName,
      replyTo: brand.supportEmail ?? undefined,
    });

    await admin
      .from("pos_sales")
      .update({ receipt_email_sent_at: new Date().toISOString(), client_email: clientEmail })
      .eq("id", saleId)
      .is("receipt_email_sent_at", null);

    return { sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send cancel notice email";
    console.error("POS cancel notice email failed", { saleId, clientEmail, message });
    return { sent: false, error: message };
  }
}

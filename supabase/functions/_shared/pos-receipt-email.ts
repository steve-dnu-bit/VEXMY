import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getShopBrandingForBooking } from "./branding.ts";
import { buildPosReceiptEmail, buildPosCancelNoticeEmail } from "./email-templates.ts";
import { emailLocaleToIntlDateLocale, resolveEmailLocale, t, type EmailLanguage } from "./email-i18n.ts";
import { getEmailDeliveryStatus, sendTransactionalEmail, siteUrl } from "./email.ts";
import { buildPosReceiptPdf, type PosReceiptLineItem } from "./pos-receipt-pdf.ts";
import { formatShopMoney } from "./shop-currency.ts";
import { loadChannelCredentials, sendTwilioMessage } from "./inbox-webhook.ts";

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

const SALE_RECEIPT_SELECT =
  "id, organization_id, artist_id, client_name, client_email, booking_id, items, currency, subtotal, tax_amount, gratuity_amount, session_total, deposit_credit_amount, total, shop_split_percent, artist_split_percent, status, created_at, receipt_email_sent_at, receipt_access_token";

export function posReceiptPublicPageUrl(token: string): string {
  return `${siteUrl()}/receipt/${encodeURIComponent(token)}`;
}

export async function ensurePosReceiptAccessToken(
  admin: SupabaseClient,
  saleId: string,
): Promise<string | null> {
  const { data: sale } = await admin
    .from("pos_sales")
    .select("id, receipt_access_token")
    .eq("id", saleId)
    .maybeSingle();
  if (!sale) return null;
  if (sale.receipt_access_token) return sale.receipt_access_token as string;

  const token = crypto.randomUUID();
  const { data: updated, error } = await admin
    .from("pos_sales")
    .update({ receipt_access_token: token })
    .eq("id", saleId)
    .select("receipt_access_token")
    .maybeSingle();
  if (error) {
    console.error("Could not set receipt_access_token", { saleId, message: error.message });
    return null;
  }
  return (updated?.receipt_access_token as string) || token;
}

export async function getPosReceiptLinkForSale(
  admin: SupabaseClient,
  saleId: string,
): Promise<{ token: string; url: string } | null> {
  const token = await ensurePosReceiptAccessToken(admin, saleId);
  if (!token) return null;
  return { token, url: posReceiptPublicPageUrl(token) };
}

type PosReceiptBundle = {
  saleId: string;
  organizationId: string;
  artistId: string | null;
  status: string;
  receiptNumber: string;
  clientName: string;
  clientEmail: string | null;
  amountPaidText: string;
  shopName: string;
  pdfBase64: string;
  filename: string;
  locale: EmailLanguage;
  brand: Awaited<ReturnType<typeof getShopBrandingForBooking>>;
  artistName: string;
  paidAtText: string;
  sessionTotalText: string;
  depositCreditText: string | null;
};

async function buildPosReceiptBundle(
  admin: SupabaseClient,
  sale: Record<string, unknown>,
): Promise<PosReceiptBundle> {
  const organizationId = String(sale.organization_id);
  const artistId = (sale.artist_id as string | null) ?? null;
  let bookingClientUserId: string | null = null;
  if (sale.booking_id) {
    const { data: booking } = await admin
      .from("bookings")
      .select("client_user_id")
      .eq("id", sale.booking_id)
      .maybeSingle();
    bookingClientUserId = booking?.client_user_id ?? null;
  }

  const { data: artistProfile } = artistId
    ? await admin.from("profiles").select("display_name").eq("user_id", artistId).maybeSingle()
    : { data: null };
  const artistName = artistProfile?.display_name?.trim() || "Artist";

  const { data: shopSettings } = await admin
    .from("shop_settings")
    .select("tax_label")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const taxLabel = shopSettings?.tax_label?.trim() || "VAT";

  const locale: EmailLanguage = await resolveEmailLocale(admin, {
    recipientUserId: bookingClientUserId,
    organizationId,
  });
  const brand = await getShopBrandingForBooking(admin, {
    organizationId,
    artistId,
  });
  const intlLocale = emailLocaleToIntlDateLocale(locale);
  const paidAt = new Date(String(sale.created_at));
  const paidAtText = paidAt.toLocaleString(intlLocale, { timeZone: "Europe/London" });
  const receiptNumber = String(sale.id).slice(0, 8).toUpperCase();
  const clientName = (sale.client_name as string | null)?.trim() || "Guest";
  const clientEmail = (sale.client_email as string | null)?.trim().toLowerCase() || null;
  const items = parseLineItems(sale.items);
  const sessionTotal = Number(sale.session_total ?? sale.total) || 0;
  const amountPaid = Number(sale.total) || 0;
  const currency = (sale.currency as string) || "gbp";
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

  return {
    saleId: String(sale.id),
    organizationId,
    artistId,
    status: String(sale.status || ""),
    receiptNumber,
    clientName,
    clientEmail,
    amountPaidText: fmt(amountPaid),
    shopName: brand.shopName,
    pdfBase64,
    filename: `receipt-${receiptNumber}.pdf`,
    locale,
    brand,
    artistName,
    paidAtText,
    sessionTotalText: fmt(sessionTotal),
    depositCreditText: Number(sale.deposit_credit_amount) > 0 ? fmt(Number(sale.deposit_credit_amount)) : null,
  };
}

export async function loadPosReceiptBundleByToken(
  admin: SupabaseClient,
  token: string,
): Promise<PosReceiptBundle | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const { data: sale } = await admin
    .from("pos_sales")
    .select(SALE_RECEIPT_SELECT)
    .eq("receipt_access_token", trimmed)
    .maybeSingle();
  if (!sale || sale.status !== "succeeded") return null;
  return buildPosReceiptBundle(admin, sale as Record<string, unknown>);
}

export async function loadPosReceiptBundleBySaleId(
  admin: SupabaseClient,
  saleId: string,
): Promise<PosReceiptBundle | null> {
  const { data: sale } = await admin
    .from("pos_sales")
    .select(SALE_RECEIPT_SELECT)
    .eq("id", saleId)
    .maybeSingle();
  if (!sale || sale.status !== "succeeded") return null;
  return buildPosReceiptBundle(admin, sale as Record<string, unknown>);
}

/** Force-send (or re-send) PDF receipt to an explicit email. */
export async function sendPosReceiptEmailToAddress(
  admin: SupabaseClient,
  saleId: string,
  toEmail: string,
): Promise<PosReceiptSendResult> {
  const emailConfig = getEmailDeliveryStatus();
  if (!emailConfig.from || (!emailConfig.resendApi && !emailConfig.smtp)) {
    return { sent: false, skipped: "email_not_configured" };
  }
  const email = toEmail.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { sent: false, skipped: "invalid_email" };
  }

  const bundle = await loadPosReceiptBundleBySaleId(admin, saleId);
  if (!bundle) return { sent: false, skipped: "sale_not_succeeded" };

  const html = buildPosReceiptEmail({
    brand: bundle.brand,
    locale: bundle.locale,
    clientName: bundle.clientName,
    artistName: bundle.artistName,
    receiptNumber: bundle.receiptNumber,
    paidAtText: bundle.paidAtText,
    amountPaidText: bundle.amountPaidText,
    sessionTotalText: bundle.sessionTotalText,
    depositCreditText: bundle.depositCreditText,
  });

  try {
    await sendTransactionalEmail({
      to: email,
      subject: t(bundle.locale, "subjects.posReceipt.default", {
        shopName: bundle.shopName,
        receiptNumber: bundle.receiptNumber,
      }),
      html,
      attachments: [{
        filename: bundle.filename,
        content: bundle.pdfBase64,
        contentType: "application/pdf",
        encoding: "base64",
      }],
      fromKind: "booking",
      fromDisplayName: bundle.shopName,
      replyTo: bundle.brand.supportEmail ?? undefined,
    });

    await admin
      .from("pos_sales")
      .update({
        receipt_email_sent_at: new Date().toISOString(),
        client_email: email,
      })
      .eq("id", saleId);

    return { sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send receipt email";
    console.error("POS receipt email (manual) failed", { saleId, email, message });
    return { sent: false, error: message };
  }
}

function normalizePhoneE164ish(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "").trim();
  if (!digits) return null;
  if (digits.startsWith("+") && digits.length >= 10) return digits;
  const only = digits.replace(/\D/g, "");
  if (only.length < 10) return null;
  // UK local without country code
  if (only.startsWith("0") && only.length >= 10) return `+44${only.slice(1)}`;
  if (only.length === 10) return `+1${only}`;
  return `+${only}`;
}

/** SMS a public receipt download link via the studio's Twilio connection. */
export async function sendPosReceiptSmsLink(
  admin: SupabaseClient,
  saleId: string,
  toPhone: string,
): Promise<PosReceiptSendResult & { url?: string }> {
  const phone = normalizePhoneE164ish(toPhone);
  if (!phone) return { sent: false, skipped: "invalid_phone" };

  const link = await getPosReceiptLinkForSale(admin, saleId);
  if (!link) return { sent: false, skipped: "sale_not_succeeded" };

  const bundle = await loadPosReceiptBundleBySaleId(admin, saleId);
  if (!bundle) return { sent: false, skipped: "sale_not_succeeded" };

  const creds = await loadChannelCredentials(admin, bundle.organizationId, "sms");
  if (!creds) return { sent: false, skipped: "sms_not_configured", url: link.url };

  const body =
    `${bundle.shopName}: your receipt (${bundle.receiptNumber}) for ${bundle.amountPaidText}. Download: ${link.url}`;

  try {
    await sendTwilioMessage(creds, phone, body, false);
    return { sent: true, url: link.url };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send receipt SMS";
    console.error("POS receipt SMS failed", { saleId, phone, message });
    return { sent: false, error: message, url: link.url };
  }
}

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

  if (!isValidEmail(clientEmail) && sale.client_name?.trim()) {
    const { data: rows } = await admin
      .from("bookings")
      .select("client_email")
      .eq("organization_id", sale.organization_id)
      .ilike("client_name", sale.client_name.trim())
      .not("client_email", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);
    for (const row of rows ?? []) {
      const email = row.client_email?.trim().toLowerCase() || null;
      if (isValidEmail(email)) {
        clientEmail = email;
        break;
      }
    }
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

  if (!isValidEmail(clientEmail) && sale.client_name?.trim()) {
    const { data: rows } = await admin
      .from("bookings")
      .select("client_email")
      .eq("organization_id", sale.organization_id)
      .ilike("client_name", sale.client_name.trim())
      .not("client_email", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);
    for (const row of rows ?? []) {
      const email = row.client_email?.trim().toLowerCase() || null;
      if (isValidEmail(email)) {
        clientEmail = email;
        break;
      }
    }
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

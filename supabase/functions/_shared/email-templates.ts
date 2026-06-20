import { getShopBranding, type ShopBranding } from "./branding.ts";
import {
  defaultAftercareForKind,
  type AftercareSection,
  type AftercareTemplateContent,
} from "./default-aftercare-templates.ts";
import {
  emailButton,
  emailDetailTable,
  emailLayout,
  emailNoteBox,
  emailButtonStack,
  escapeHtml,
  formatBookingDateRange,
  formatDateTimeGb,
  getBookingReplyEmail,
  siteUrl,
} from "./email.ts";
import { t, type EmailLanguage } from "./email-i18n.ts";
import { bookingIcsAttachment, type IcsBookingEvent } from "./ics.ts";
import type { EmailAttachment } from "./email.ts";
import { formatShopMoney } from "./shop-currency.ts";

export type BookingEmailDetails = {
  id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  artistName: string;
  artistEmail?: string | null;
  booking_type: string;
  service_category?: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  notes?: string | null;
  tattoo_style?: string | null;
  tattoo_size?: string | null;
  tattoo_placement?: string | null;
  deposit_amount?: number | null;
  deposit_paid?: boolean | null;
};

function formatBookingType(booking: Pick<BookingEmailDetails, "booking_type" | "service_category">): string {
  const type = booking.booking_type?.replace(/-/g, " ") || "Session";
  const cat = booking.service_category?.trim();
  if (cat) return `${cat.charAt(0).toUpperCase()}${cat.slice(1)} · ${type.charAt(0).toUpperCase()}${type.slice(1)}`;
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function depositStatusLabel(
  paid: boolean | null | undefined,
  amount: number | null | undefined,
  currency = "gbp",
  locale: EmailLanguage = "en",
): string {
  const formattedAmount = amount ? formatShopMoney(Number(amount), currency) : null;
  if (paid) {
    if (formattedAmount) return t(locale, "depositStatus.paidWithAmount", { amount: formattedAmount });
    return t(locale, "depositStatus.paid");
  }
  if (formattedAmount) return t(locale, "depositStatus.outstandingWithAmount", { amount: formattedAmount });
  return t(locale, "depositStatus.outstanding");
}

export function buildBookingIcsEvent(
  action: "created" | "updated" | "deleted",
  booking: BookingEmailDetails,
  brand: ShopBranding,
  recipientEmail?: string | null,
): IcsBookingEvent {
  const isCancel = action === "deleted";
  const title = `${brand.shopName} — ${formatBookingType(booking)} with ${booking.artistName}`;
  const desc = [
    `Client: ${booking.client_name}`,
    `Artist: ${booking.artistName}`,
    `Status: ${booking.status}`,
    booking.notes ? `Notes: ${booking.notes}` : null,
    `Manage booking: ${siteUrl()}/auth`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    uid: `${booking.id}@velbok.com`,
    title: isCancel ? `CANCELLED: ${title}` : title,
    description: desc,
    location: brand.address || brand.shopName,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    organizerName: brand.shopName,
    organizerEmail: getBookingReplyEmail(),
    attendeeName: booking.client_name,
    attendeeEmail: recipientEmail || booking.client_email || undefined,
    method: isCancel ? "CANCEL" : "REQUEST",
    status: isCancel ? "CANCELLED" : "CONFIRMED",
  };
}

export function buildBookingNotificationEmail(params: {
  action: "created" | "updated" | "deleted";
  recipientName: string;
  recipientRole?: "artist" | "customer";
  booking: BookingEmailDetails;
  includeCalendarHint?: boolean;
  locale?: EmailLanguage;
  brand?: ShopBranding;
}): { html: string; attachments: EmailAttachment[] } {
  const { action, recipientName, booking } = params;
  const locale = params.locale ?? "en";
  const brand = params.brand ?? getShopBranding();
  const recipientRole = params.recipientRole ?? "customer";
  const title = action === "created"
    ? t(locale, "bookingNotification.title.created")
    : action === "updated"
      ? t(locale, "bookingNotification.title.updated")
      : t(locale, "bookingNotification.title.deleted");
  const introRole = recipientRole === "artist" ? "artist" : "customer";
  const intro = t(locale, `bookingNotification.intro.${introRole}.${action}`, {
    shopName: escapeHtml(brand.shopName),
    artistName: escapeHtml(booking.artistName),
    clientName: escapeHtml(booking.client_name),
  });

  const details = emailDetailTable([
    { label: t(locale, "bookingNotification.details.client"), value: booking.client_name },
    { label: t(locale, "bookingNotification.details.artist"), value: booking.artistName },
    { label: t(locale, "bookingNotification.details.dateTime"), value: formatBookingDateRange(booking.starts_at, booking.ends_at, locale) },
    { label: t(locale, "bookingNotification.details.service"), value: formatBookingType(booking) },
    { label: t(locale, "bookingNotification.details.status"), value: booking.status || "confirmed" },
    { label: t(locale, "bookingNotification.details.style"), value: booking.tattoo_style },
    { label: t(locale, "bookingNotification.details.size"), value: booking.tattoo_size },
    { label: t(locale, "bookingNotification.details.placement"), value: booking.tattoo_placement },
    { label: t(locale, "bookingNotification.details.phone"), value: booking.client_phone },
    { label: t(locale, "bookingNotification.details.email"), value: booking.client_email },
    { label: t(locale, "bookingNotification.details.reference"), value: booking.id.slice(0, 8).toUpperCase() },
  ]);

  const notes = booking.notes ? emailNoteBox(t(locale, "bookingNotification.notes.studioNotes"), booking.notes) : "";
  const calendarHint = params.includeCalendarHint !== false
    ? emailNoteBox(
        t(locale, "bookingNotification.calendarHint.title"),
        t(locale, "bookingNotification.calendarHint.body"),
      )
    : "";

  const html = emailLayout({
    brand,
    locale,
    badge: t(locale, "bookingNotification.badge"),
    title,
    greeting: t(locale, "common.greeting", { name: escapeHtml(recipientName) }),
    intro,
    bodyHtml: `${details}${notes}${calendarHint}`,
  });

  const ics = bookingIcsAttachment(buildBookingIcsEvent(action, booking, brand, booking.client_email));
  return { html, attachments: [ics] };
}

export function buildAppointmentReminderEmail(
  booking: BookingEmailDetails,
  locale: EmailLanguage = "en",
  brandOverride?: ShopBranding,
): {
  html: string;
  attachments: EmailAttachment[];
} {
  const brand = brandOverride ?? getShopBranding();
  const details = emailDetailTable([
    { label: t(locale, "appointmentReminder.details.artist"), value: booking.artistName },
    { label: t(locale, "appointmentReminder.details.when"), value: formatBookingDateRange(booking.starts_at, booking.ends_at, locale) },
    { label: t(locale, "appointmentReminder.details.service"), value: formatBookingType(booking) },
    { label: t(locale, "appointmentReminder.details.deposit"), value: depositStatusLabel(booking.deposit_paid, booking.deposit_amount, "gbp", locale) },
  ]);

  const html = emailLayout({
    brand,
    locale,
    badge: t(locale, "appointmentReminder.badge"),
    title: t(locale, "appointmentReminder.title"),
    greeting: t(locale, "common.greeting", { name: escapeHtml(booking.client_name) }),
    intro: t(locale, "appointmentReminder.intro", {
      shopName: escapeHtml(brand.shopName),
      artistName: escapeHtml(booking.artistName),
    }),
    bodyHtml: `${details}${emailNoteBox(t(locale, "appointmentReminder.notes.calendarTitle"), t(locale, "appointmentReminder.notes.calendarBody"))}`,
  });

  return {
    html,
    attachments: [bookingIcsAttachment(buildBookingIcsEvent("updated", booking, brand, booking.client_email))],
  };
}

export function buildDepositReminderEmail(
  booking: BookingEmailDetails,
  checkoutUrl?: string,
  locale: EmailLanguage = "en",
  brandOverride?: ShopBranding,
): {
  html: string;
  attachments: EmailAttachment[];
} {
  const brand = brandOverride ?? getShopBranding();
  const amount = booking.deposit_amount
    ? formatShopMoney(Number(booking.deposit_amount), "gbp")
    : t(locale, "depositReminder.amountPlaceholder");
  const payBlock = checkoutUrl
    ? emailButton(checkoutUrl, t(locale, "depositReminder.pay.buttonLabel"), locale)
    : emailNoteBox(
        t(locale, "depositReminder.pay.noteTitle"),
        t(locale, "depositReminder.pay.noteBody", { supportEmail: brand.supportEmail, amount }),
      );
  const dateRange = escapeHtml(formatBookingDateRange(booking.starts_at, booking.ends_at, locale));
  const intro = t(locale, "depositReminder.intro", {
    shopName: escapeHtml(brand.shopName),
    artistName: escapeHtml(booking.artistName),
    dateRange,
    amount: escapeHtml(amount),
  });

  const html = emailLayout({
    brand,
    locale,
    badge: t(locale, "depositReminder.badge"),
    title: t(locale, "depositReminder.title"),
    greeting: t(locale, "common.greeting", { name: escapeHtml(booking.client_name) }),
    intro,
    bodyHtml: `${emailDetailTable([
      { label: t(locale, "depositReminder.details.artist"), value: booking.artistName },
      { label: t(locale, "depositReminder.details.appointment"), value: formatBookingDateRange(booking.starts_at, booking.ends_at, locale) },
      { label: t(locale, "depositReminder.details.depositDue"), value: amount },
    ])}${payBlock}`,
  });

  return {
    html,
    attachments: [bookingIcsAttachment(buildBookingIcsEvent("updated", booking, brand, booking.client_email))],
  };
}

export function buildDepositRequestEmail(params: {
  clientName: string;
  artistName?: string | null;
  startsAt: string;
  checkoutUrl: string;
  depositAmount?: number | null;
  currency?: string;
  locale?: EmailLanguage;
  brand?: ShopBranding;
}): string {
  const brand = params.brand ?? getShopBranding();
  const locale = params.locale ?? "en";
  const amount = params.depositAmount
    ? formatShopMoney(Number(params.depositAmount), params.currency ?? "gbp")
    : t(locale, "depositRequest.amountPlaceholder");
  const startsAtText = escapeHtml(formatDateTimeGb(params.startsAt, locale));
  return emailLayout({
    brand,
    locale,
    badge: t(locale, "depositRequest.badge"),
    title: t(locale, "depositRequest.title"),
    greeting: t(locale, "common.greeting", { name: escapeHtml(params.clientName || "there") }),
    intro: t(locale, "depositRequest.intro", {
      shopName: escapeHtml(brand.shopName),
      artistName: escapeHtml(params.artistName ?? brand.shopName),
      amount: escapeHtml(amount),
      startsAt: startsAtText,
    }),
    bodyHtml: emailButton(params.checkoutUrl, t(locale, "depositRequest.buttonLabel"), locale),
  });
}

export function buildDepositReceiptEmail(params: {
  clientName: string;
  startsAt: string;
  amount: number;
  currency?: string;
  booking?: BookingEmailDetails | null;
  locale?: EmailLanguage;
  brand?: ShopBranding;
}): { html: string; attachments?: EmailAttachment[] } {
  const brand = params.brand ?? getShopBranding();
  const locale = params.locale ?? "en";
  const currency = params.currency ?? "gbp";
  const body = emailDetailTable([
    { label: t(locale, "depositReceipt.details.amountReceived"), value: formatShopMoney(params.amount, currency) },
    { label: t(locale, "depositReceipt.details.sessionDate"), value: formatDateTimeGb(params.startsAt, locale) },
    { label: t(locale, "depositReceipt.details.status"), value: t(locale, "depositReceipt.statusPaid") },
  ]);

  const html = emailLayout({
    brand,
    locale,
    badge: t(locale, "depositReceipt.badge"),
    title: t(locale, "depositReceipt.title"),
    greeting: t(locale, "common.greeting", { name: escapeHtml(params.clientName || "there") }),
    intro: t(locale, "depositReceipt.intro", {
      shopName: escapeHtml(brand.shopName),
      artistName: escapeHtml(params.booking?.artistName ?? brand.shopName),
    }),
    bodyHtml: body,
    footerNote: t(locale, "depositReceipt.footer"),
  });

  if (params.booking) {
    return {
      html,
      attachments: [bookingIcsAttachment(buildBookingIcsEvent("updated", params.booking, brand, params.booking.client_email))],
    };
  }
  return { html };
}

export function buildChatUpdateEmail(params: {
  recipientName: string;
  senderName: string;
  previewText: string;
  chatUrl: string;
  locale?: EmailLanguage;
}): string {
  const brand = getShopBranding();
  const locale = params.locale ?? "en";
  const senderNameStrong = `<strong>${escapeHtml(params.senderName)}</strong>`;
  return emailLayout({
    brand,
    locale,
    badge: t(locale, "chatUpdate.badge"),
    title: t(locale, "chatUpdate.title"),
    greeting: t(locale, "common.greeting", { name: escapeHtml(params.recipientName) }),
    intro: t(locale, "chatUpdate.intro", { senderName: senderNameStrong }),
    bodyHtml: `${emailNoteBox(t(locale, "chatUpdate.preview.noteTitle"), params.previewText)}${emailButton(params.chatUrl, t(locale, "chatUpdate.openChatButtonLabel"), locale)}`,
    footerNote: t(locale, "chatUpdate.footerNote"),
  });
}

export function buildInvoiceEmail(params: {
  clientFirstName: string;
  invoiceNumber: string;
  issueText: string;
  dueText: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentMethodLabel: string;
  paymentTermLabel: string;
  notes?: string | null;
  payUrl?: string | null;
  currency?: string;
  taxLabel?: string;
  locale?: EmailLanguage;
}): string {
  const brand = getShopBranding();
  const locale = params.locale ?? "en";
  const currency = params.currency ?? "gbp";
  const taxLabel = params.taxLabel ?? "VAT";
  const fmt = (n: number) => formatShopMoney(Number(n), currency);
  const details = emailDetailTable([
    { label: t(locale, "invoice.details.invoiceNumber"), value: params.invoiceNumber },
    { label: t(locale, "invoice.details.issueDate"), value: params.issueText },
    { label: t(locale, "invoice.details.dueDate"), value: params.dueText },
    { label: t(locale, "invoice.details.subtotal"), value: fmt(params.subtotal) },
    { label: taxLabel, value: fmt(params.taxAmount) },
    { label: t(locale, "invoice.details.totalDue"), value: fmt(params.total) },
    { label: t(locale, "invoice.details.paymentMethod"), value: params.paymentMethodLabel },
    { label: t(locale, "invoice.details.paymentOption"), value: params.paymentTermLabel },
    { label: t(locale, "invoice.details.legalName"), value: brand.legalName },
    { label: t(locale, "invoice.details.tradingName"), value: brand.tradingName },
  ]);

  const notesBlock = params.notes ? emailNoteBox(t(locale, "invoice.notesBlockTitle"), params.notes) : "";
  const payBlock = params.payUrl ? emailButton(params.payUrl, t(locale, "invoice.payButtonLabel"), locale) : "";

  const intro = t(locale, "invoice.intro", { shopName: escapeHtml(brand.shopName) });
  const footerNote = t(locale, "invoice.footerNote", { invoiceNumber: params.invoiceNumber });

  return emailLayout({
    brand,
    locale,
    badge: t(locale, "invoice.badge"),
    title: t(locale, "invoice.title", { invoiceNumber: params.invoiceNumber }),
    greeting: t(locale, "common.greeting", { name: escapeHtml(params.clientFirstName) }),
    intro,
    bodyHtml: `${details}${notesBlock}${payBlock}`,
    footerNote,
  });
}

function aftercareSection(title: string, html: string, accentColor: string): string {
  return `
    <h3 style="margin:16px 0 10px;font-size:15px;color:${accentColor};">${escapeHtml(title)}</h3>
    ${html}`;
}

function aftercareList(items: string[], ordered = false): string {
  const tag = ordered ? "ol" : "ul";
  const rows = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<${tag} style="margin:0 0 12px 18px;padding:0;line-height:1.65;color:#e8e8e8;font-size:13px;">${rows}</${tag}>`;
}

function renderAftercareIntro(template: string, shopName: string, bookingWindow: string): string {
  const withWindow = template
    .replace(/\{\{shopName\}\}/g, escapeHtml(shopName))
    .replace(/\{\{bookingWindow\}\}/g, `<strong>${escapeHtml(bookingWindow)}</strong>`);
  return withWindow;
}

function renderAftercareSections(sections: AftercareSection[], accentColor: string): string {
  return sections
    .map((section) => {
      if (section.bodyHtml) {
        return aftercareSection(section.title, section.bodyHtml, accentColor);
      }
      if (section.listItems?.length) {
        return aftercareSection(
          section.title,
          aftercareList(section.listItems, !!section.orderedList),
          accentColor,
        );
      }
      return "";
    })
    .join("");
}

export function buildAftercareEmailFromTemplate(params: {
  template: AftercareTemplateContent;
  clientName: string;
  bookingWindow: string;
  shopName?: string;
  locale?: EmailLanguage;
}): string {
  const brand = getShopBranding();
  const locale = params.locale ?? "en";
  const shopName = params.shopName || brand.shopName;
  const intro = renderAftercareIntro(params.template.introTemplate, shopName, params.bookingWindow);
  const bodyHtml = renderAftercareSections(params.template.sections, brand.accentColor);

  return emailLayout({
    brand,
    locale,
    badge: params.template.badge,
    title: params.template.title,
    greeting: t(locale, "common.greeting", { name: escapeHtml(params.clientName) }),
    intro,
    bodyHtml,
  });
}

export function aftercareEmailSubject(template: AftercareTemplateContent, tradingName: string): string {
  return `${template.emailSubject} — ${tradingName}`;
}

export function buildReviewRequestEmail(params: {
  brand?: ShopBranding;
  clientName: string;
  artistName: string;
  startsAt: string;
  endsAt: string;
  reviewLinks: Array<{ label: string; url: string }>;
  customMessage?: string | null;
  locale?: EmailLanguage;
}): string {
  const brand = params.brand ?? getShopBranding();
  const locale = params.locale ?? "en";
  const defaultIntro = t(locale, "reviewRequest.intro", {
    shopName: escapeHtml(brand.shopName),
    artistName: escapeHtml(params.artistName),
  });
  const custom = params.customMessage?.trim();
  const intro = custom
    ? `${escapeHtml(custom)}<br/><br/><span style="color:#d7d7d7;">${defaultIntro}</span>`
    : defaultIntro;
  const when = formatBookingDateRange(params.startsAt, params.endsAt, locale);

  const bodyHtml = `${emailDetailTable([
    { label: t(locale, "reviewRequest.details.artist"), value: params.artistName },
    { label: t(locale, "reviewRequest.details.visit"), value: when },
  ])}${emailButtonStack(
    params.reviewLinks.map((l) => ({ href: l.url, label: l.label })),
    locale,
  )}${emailNoteBox(t(locale, "reviewRequest.note.title"), t(locale, "reviewRequest.note.body"))}`;

  return emailLayout({
    brand,
    locale,
    badge: t(locale, "reviewRequest.badge"),
    title: t(locale, "reviewRequest.title"),
    greeting: t(locale, "common.greeting", { name: escapeHtml(params.clientName) }),
    intro,
    bodyHtml,
    footerNote: t(locale, "reviewRequest.footer"),
  });
}

export function buildPosReceiptEmail(params: {
  brand?: ShopBranding;
  clientName: string;
  artistName: string;
  receiptNumber: string;
  paidAtText: string;
  amountPaidText: string;
  sessionTotalText: string;
  depositCreditText?: string | null;
  locale?: EmailLanguage;
}): string {
  const brand = params.brand ?? getShopBranding();
  const locale = params.locale ?? "en";
  const intro = t(locale, "posReceipt.intro", {
    shopName: escapeHtml(brand.shopName),
    artistName: escapeHtml(params.artistName),
  });

  const details = emailDetailTable([
    { label: t(locale, "posReceipt.details.artist"), value: params.artistName },
    { label: t(locale, "posReceipt.details.studio"), value: brand.shopName },
    { label: t(locale, "posReceipt.details.date"), value: params.paidAtText },
    { label: t(locale, "posReceipt.details.receiptNumber"), value: params.receiptNumber },
    { label: t(locale, "posReceipt.details.sessionTotal"), value: params.sessionTotalText },
    ...(params.depositCreditText
      ? [{ label: t(locale, "posReceipt.details.depositCredit"), value: `-${params.depositCreditText}` }]
      : []),
    { label: t(locale, "posReceipt.details.amountPaid"), value: params.amountPaidText },
  ]);

  return emailLayout({
    brand,
    locale,
    badge: t(locale, "posReceipt.badge"),
    title: t(locale, "posReceipt.title"),
    greeting: t(locale, "common.greeting", { name: escapeHtml(params.clientName) }),
    intro,
    bodyHtml: `${details}${emailNoteBox(t(locale, "posReceipt.note.title"), t(locale, "posReceipt.note.body"))}`,
    footerNote: t(locale, "posReceipt.footer"),
  });
}

export function buildAftercareEmail(params: {
  kind: "tattoo" | "piercing";
  clientName: string;
  bookingWindow: string;
  template?: AftercareTemplateContent;
  locale?: EmailLanguage;
}): string {
  const content = params.template ?? defaultAftercareForKind(params.kind);
  return buildAftercareEmailFromTemplate({
    template: content,
    clientName: params.clientName,
    bookingWindow: params.bookingWindow,
    locale: params.locale,
  });
}

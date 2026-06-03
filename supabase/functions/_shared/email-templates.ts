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
  escapeHtml,
  formatBookingDateRange,
  formatDateTimeGb,
  getBookingReplyEmail,
  siteUrl,
} from "./email.ts";
import { bookingIcsAttachment, type IcsBookingEvent } from "./ics.ts";
import type { EmailAttachment } from "./email.ts";

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

function depositStatusLabel(paid: boolean | null | undefined, amount: number | null | undefined): string {
  if (paid) return amount ? `Paid (£${Number(amount).toFixed(2)})` : "Paid";
  if (amount) return `Outstanding (£${Number(amount).toFixed(2)})`;
  return "Outstanding";
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
  booking: BookingEmailDetails;
  includeCalendarHint?: boolean;
}): { html: string; attachments: EmailAttachment[] } {
  const { action, recipientName, booking } = params;
  const brand = getShopBranding();
  const title =
    action === "created" ? "Booking confirmed" : action === "updated" ? "Booking updated" : "Booking cancelled";
  const intro =
    action === "created"
      ? "Your appointment is confirmed. Full details are below — add it to your calendar using the attached file."
      : action === "updated"
        ? "Your appointment details have changed. Review the update below and re-import the calendar file if needed."
        : "This appointment has been cancelled. The attached calendar file will remove it from supported calendar apps.";

  const details = emailDetailTable([
    { label: "Client", value: booking.client_name },
    { label: "Artist", value: booking.artistName },
    { label: "Date & time", value: formatBookingDateRange(booking.starts_at, booking.ends_at) },
    { label: "Service", value: formatBookingType(booking) },
    { label: "Status", value: booking.status || "confirmed" },
    { label: "Style", value: booking.tattoo_style },
    { label: "Size", value: booking.tattoo_size },
    { label: "Placement", value: booking.tattoo_placement },
    { label: "Deposit", value: depositStatusLabel(booking.deposit_paid, booking.deposit_amount) },
    { label: "Phone", value: booking.client_phone },
    { label: "Email", value: booking.client_email },
    { label: "Reference", value: booking.id.slice(0, 8).toUpperCase() },
  ]);

  const notes = booking.notes ? emailNoteBox("Studio notes", booking.notes) : "";
  const calendarHint = params.includeCalendarHint !== false
    ? emailNoteBox(
        "Add to calendar",
        "Open the attached booking.ics file on your phone or computer to add this appointment to Apple Calendar, Google Calendar, or Outlook.",
      )
    : "";

  const html = emailLayout({
    brand,
    badge: "Booking",
    title,
    greeting: `Hi ${escapeHtml(recipientName)},`,
    intro,
    bodyHtml: `${details}${notes}${calendarHint}`,
  });

  const ics = bookingIcsAttachment(buildBookingIcsEvent(action, booking, brand, booking.client_email));
  return { html, attachments: [ics] };
}

export function buildAppointmentReminderEmail(booking: BookingEmailDetails): {
  html: string;
  attachments: EmailAttachment[];
} {
  const brand = getShopBranding();
  const details = emailDetailTable([
    { label: "Artist", value: booking.artistName },
    { label: "When", value: formatBookingDateRange(booking.starts_at, booking.ends_at) },
    { label: "Service", value: formatBookingType(booking) },
    { label: "Deposit", value: depositStatusLabel(booking.deposit_paid, booking.deposit_amount) },
  ]);

  const html = emailLayout({
    brand,
    badge: "Appointment reminder",
    title: "Your session is coming up",
    greeting: `Hi ${escapeHtml(booking.client_name)},`,
    intro: "This is a friendly reminder about your upcoming appointment.",
    bodyHtml: `${details}${emailNoteBox("Calendar", "Use the attached booking.ics file to add or update this appointment in your calendar.")}`,
  });

  return {
    html,
    attachments: [bookingIcsAttachment(buildBookingIcsEvent("updated", booking, brand, booking.client_email))],
  };
}

export function buildDepositReminderEmail(booking: BookingEmailDetails, checkoutUrl?: string): {
  html: string;
  attachments: EmailAttachment[];
} {
  const brand = getShopBranding();
  const amount = booking.deposit_amount ? `£${Number(booking.deposit_amount).toFixed(2)}` : "your deposit";
  const payBlock = checkoutUrl
    ? emailButton(checkoutUrl, "Pay deposit securely")
    : emailNoteBox("Payment", `Please contact ${brand.supportEmail} to complete your ${amount} deposit.`);

  const html = emailLayout({
    brand,
    badge: "Deposit reminder",
    title: "Deposit still outstanding",
    greeting: `Hi ${escapeHtml(booking.client_name)},`,
    intro: `Your session on ${escapeHtml(formatBookingDateRange(booking.starts_at, booking.ends_at))} requires a ${amount} deposit to secure your slot.`,
    bodyHtml: `${emailDetailTable([
      { label: "Artist", value: booking.artistName },
      { label: "Appointment", value: formatBookingDateRange(booking.starts_at, booking.ends_at) },
      { label: "Deposit due", value: amount },
    ])}${payBlock}`,
  });

  return {
    html,
    attachments: [bookingIcsAttachment(buildBookingIcsEvent("updated", booking, brand, booking.client_email))],
  };
}

export function buildDepositRequestEmail(params: {
  clientName: string;
  startsAt: string;
  checkoutUrl: string;
  depositAmount?: number | null;
}): string {
  const brand = getShopBranding();
  const amount = params.depositAmount ? `£${Number(params.depositAmount).toFixed(2)}` : "your deposit";
  return emailLayout({
    brand,
    badge: "Deposit payment",
    title: "Complete your deposit",
    greeting: `Hi ${escapeHtml(params.clientName || "there")},`,
    intro: `Please pay ${amount} to secure your session on ${escapeHtml(formatDateTimeGb(params.startsAt))}.`,
    bodyHtml: emailButton(params.checkoutUrl, "Pay deposit securely"),
  });
}

export function buildDepositReceiptEmail(params: {
  clientName: string;
  startsAt: string;
  amountGbp: number;
  booking?: BookingEmailDetails | null;
}): { html: string; attachments?: EmailAttachment[] } {
  const brand = getShopBranding();
  const body = emailDetailTable([
    { label: "Amount received", value: `£${params.amountGbp.toFixed(2)}` },
    { label: "Session date", value: formatDateTimeGb(params.startsAt) },
    { label: "Status", value: "Deposit paid — session secured" },
  ]);

  const html = emailLayout({
    brand,
    badge: "Payment confirmation",
    title: "Deposit received",
    greeting: `Hi ${escapeHtml(params.clientName || "there")},`,
    intro: "Thank you — we've received your deposit payment.",
    bodyHtml: body,
    footerNote: "Keep this email for your records.",
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
}): string {
  const brand = getShopBranding();
  return emailLayout({
    brand,
    badge: "Message",
    title: "New chat update",
    greeting: `Hi ${escapeHtml(params.recipientName)},`,
    intro: `<strong>${escapeHtml(params.senderName)}</strong> sent you a message:`,
    bodyHtml: `${emailNoteBox("Preview", params.previewText)}${emailButton(params.chatUrl, "Open chat")}`,
    footerNote: "Please sign in first if prompted.",
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
}): string {
  const brand = getShopBranding();
  const fmt = (n: number) => `£${Number(n).toFixed(2)}`;
  const details = emailDetailTable([
    { label: "Invoice number", value: params.invoiceNumber },
    { label: "Issue date", value: params.issueText },
    { label: "Due date", value: params.dueText },
    { label: "Subtotal", value: fmt(params.subtotal) },
    { label: "VAT", value: fmt(params.taxAmount) },
    { label: "Total due", value: fmt(params.total) },
    { label: "Payment method", value: params.paymentMethodLabel },
    { label: "Payment option", value: params.paymentTermLabel },
    { label: "Legal name", value: brand.legalName },
    { label: "Trading name", value: brand.tradingName },
  ]);

  const notesBlock = params.notes ? emailNoteBox("Note from studio", params.notes) : "";
  const payBlock = params.payUrl ? emailButton(params.payUrl, "Pay this invoice securely") : "";

  return emailLayout({
    brand,
    badge: "Invoice",
    title: `Invoice ${params.invoiceNumber}`,
    greeting: `Hi ${escapeHtml(params.clientFirstName)},`,
    intro: `Your personalised invoice from ${escapeHtml(brand.shopName)} is ready. A detailed PDF copy is attached.`,
    bodyHtml: `${details}${notesBlock}${payBlock}`,
    footerNote: `Please use ${params.invoiceNumber} as your payment reference.`,
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
}): string {
  const brand = getShopBranding();
  const shopName = params.shopName || brand.shopName;
  const intro = renderAftercareIntro(params.template.introTemplate, shopName, params.bookingWindow);
  const bodyHtml = renderAftercareSections(params.template.sections, brand.accentColor);

  return emailLayout({
    brand,
    badge: params.template.badge,
    title: params.template.title,
    greeting: `Hi ${escapeHtml(params.clientName)},`,
    intro,
    bodyHtml,
  });
}

export function aftercareEmailSubject(template: AftercareTemplateContent, tradingName: string): string {
  return `${template.emailSubject} — ${tradingName}`;
}

export function buildAftercareEmail(params: {
  kind: "tattoo" | "piercing";
  clientName: string;
  bookingWindow: string;
  template?: AftercareTemplateContent;
}): string {
  const content = params.template ?? defaultAftercareForKind(params.kind);
  return buildAftercareEmailFromTemplate({
    template: content,
    clientName: params.clientName,
    bookingWindow: params.bookingWindow,
  });
}

import nodemailer from "npm:nodemailer@6.9.15";
import { emailSupportLine, getShopBranding, type ShopBranding } from "./branding.ts";

export type SmtpConfig = {
  host: string;
  port: string;
  username: string;
  password: string;
  from: string;
};

export type EmailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
  contentDisposition?: "attachment" | "inline";
  encoding?: "base64" | "utf-8";
};

const TZ = "Europe/London";

export function getSmtpConfig(): SmtpConfig | null {
  const host = Deno.env.get("SMTP_HOST") ?? null;
  const port = Deno.env.get("SMTP_PORT") ?? null;
  const username = Deno.env.get("SMTP_USER") ?? null;
  const password = Deno.env.get("SMTP_PASS") ?? Deno.env.get("SMTP_PASSWORD") ?? null;
  const from = Deno.env.get("NOTIFICATIONS_EMAIL_FROM") ?? Deno.env.get("EMAIL_FROM") ?? Deno.env.get("SMTP_FROM") ?? null;
  if (!host || !port || !username || !password || !from) return null;
  return { host, port, username, password, from };
}

export function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function displayOrNa(value: string | null | undefined): string {
  return escapeHtml(value?.trim() || "N/A");
}

export function formatBookingDateRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const datePart = start.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });
  const startTime = start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const endTime = end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return `${datePart} · ${startTime} – ${endTime}`;
}

export function formatDateTimeGb(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
}

export function emailDetailTable(rows: Array<{ label: string; value: string | null | undefined }>): string {
  const items = rows
    .filter((r) => r.value !== null && r.value !== undefined && String(r.value).trim() !== "")
    .map(
      (r, i, arr) => `
      <tr>
        <td style="padding:10px 0;${i < arr.length - 1 ? "border-bottom:1px solid #2a2a2e;" : ""}font-size:14px;color:#9f9f9f;width:38%;vertical-align:top;">${escapeHtml(r.label)}</td>
        <td style="padding:10px 0;${i < arr.length - 1 ? "border-bottom:1px solid #2a2a2e;" : ""}font-size:14px;color:#f0f0f0;font-weight:600;text-align:right;vertical-align:top;">${displayOrNa(r.value)}</td>
      </tr>`,
    )
    .join("");
  if (!items) return "";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #2a2a2e;background:#0d0d11;border-radius:10px;margin:16px 0;">
      <tr><td style="padding:4px 16px;">${items ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${items}</table>` : ""}</td></tr>
    </table>`;
}

export function emailButton(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:20px auto;">
      <tr>
        <td align="center" bgcolor="${getShopBranding().accentColor}" style="border-radius:999px;background-color:${getShopBranding().accentColor};">
          <a href="${href}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:800;color:#1a1a1a;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>
    <p style="margin:8px 0 0;font-size:12px;color:#9f9f9f;word-break:break-all;text-align:center;">If the button does not work: <a href="${safeHref}" style="color:${getShopBranding().accentColor};">${safeHref}</a></p>`;
}

export function emailNoteBox(title: string, body: string): string {
  return `
    <div style="margin-top:14px;border:1px solid #2a2a2e;background:#0d0d11;border-radius:10px;padding:12px 14px;">
      <p style="margin:0 0 6px;font-size:12px;color:#9f9f9f;text-transform:uppercase;letter-spacing:.3px;">${escapeHtml(title)}</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#e5e5e5;">${escapeHtml(body)}</p>
    </div>`;
}

export function emailLayout(params: {
  brand?: ShopBranding;
  badge: string;
  title: string;
  greeting?: string;
  intro: string;
  bodyHtml?: string;
  footerNote?: string;
}): string {
  const brand = params.brand ?? getShopBranding();
  const accent = brand.accentColor || "#d4af37";
  const greeting = params.greeting
    ? `<p style="margin:0 0 12px;font-size:15px;color:#d7d7d7;">${params.greeting}</p>`
    : "";
  const body = params.bodyHtml ?? "";
  const footer = params.footerNote
    ? `<p style="margin:14px 0 0;font-size:12px;color:#9f9f9f;">${escapeHtml(params.footerNote)}</p>`
    : `<p style="margin:14px 0 0;font-size:12px;color:#9f9f9f;">Automated message from ${escapeHtml(brand.shopName)}.</p>`;

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#090a0f;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#090a0f;font-family:Arial,Helvetica,sans-serif;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:100%;max-width:600px;border:1px solid #2a2a2e;border-radius:14px;background:#121216;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.35);">
          <tr>
            <td align="center" style="padding:22px 24px;background:linear-gradient(180deg,#1a1a1f,#101014);border-bottom:1px solid #2a2a2e;">
              <p style="margin:0;font-size:28px;font-weight:900;letter-spacing:.8px;color:${accent};">${escapeHtml(brand.shopName.toUpperCase())}</p>
              <p style="margin:8px 0 0;font-size:11px;letter-spacing:.35px;color:#c7c7c7;text-transform:uppercase;">${escapeHtml(params.badge)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 26px;">
              <h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;color:${accent};font-weight:800;">${escapeHtml(params.title)}</h1>
              ${greeting}
              <p style="margin:0 0 4px;font-size:14px;line-height:1.65;color:#d7d7d7;">${params.intro}</p>
              ${body}
              ${emailSupportLine(brand)}
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export type EmailFromKind = "booking" | "notification";

export function getEmailFrom(kind: EmailFromKind = "notification"): string | null {
  const legacy = Deno.env.get("EMAIL_FROM") ?? Deno.env.get("SMTP_FROM") ?? null;
  if (kind === "booking") {
    return Deno.env.get("BOOKINGS_EMAIL_FROM") ?? legacy ?? "Velbok <bookings@velbok.com>";
  }
  return Deno.env.get("NOTIFICATIONS_EMAIL_FROM") ?? legacy ?? "Velbok <notifications@velbok.com>";
}

/** Bare address for calendar organizer / reply-to on booking mail. */
export function getBookingReplyEmail(): string {
  return (
    Deno.env.get("BOOKINGS_REPLY_TO") ??
    Deno.env.get("SHOP_SUPPORT_EMAIL") ??
    "bookings@velbok.com"
  );
}

export function getEmailDeliveryStatus(): { resendApi: boolean; smtp: boolean; from: boolean } {
  const resendKey = (Deno.env.get("RESEND_API_KEY") ?? Deno.env.get("SMTP_PASS") ?? Deno.env.get("SMTP_PASSWORD") ?? "").trim();
  const hasFrom =
    !!getEmailFrom("booking") &&
    !!getEmailFrom("notification");
  return {
    resendApi: !!resendKey,
    smtp: !!getSmtpConfig(),
    from: hasFrom,
  };
}

function attachmentToBase64(content: string, encoding?: EmailAttachment["encoding"]): string {
  if (encoding === "base64") return content;
  const bytes = new TextEncoder().encode(content);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function sendViaResendApi(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string | null;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const attachments = params.attachments?.map((a) => ({
    filename: a.filename,
    content: attachmentToBase64(a.content, a.encoding),
    ...(a.contentType ? { content_type: a.contentType } : {}),
  }));

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      ...(attachments?.length ? { attachments } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API ${res.status}: ${text || res.statusText}`);
  }
}

async function sendViaSmtp(params: {
  smtp: SmtpConfig;
  from: string;
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const portNum = Number(params.smtp.port);
  if (!Number.isFinite(portNum)) throw new Error("SMTP_PORT must be a number.");

  const transporter = nodemailer.createTransport({
    host: params.smtp.host,
    port: portNum,
    secure: portNum === 465,
    auth: { user: params.smtp.username, pass: params.smtp.password },
    requireTLS: portNum !== 465,
  });

  await transporter.sendMail({
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      contentDisposition: a.contentDisposition ?? "attachment",
      ...(a.encoding ? { encoding: a.encoding } : {}),
    })),
  });
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  fromKind?: EmailFromKind;
  replyTo?: string | null;
}): Promise<{ provider: "resend" | "smtp" }> {
  const fromKind = params.fromKind ?? "notification";
  const from = getEmailFrom(fromKind);
  if (!from) {
    throw new Error(
      fromKind === "booking"
        ? "BOOKINGS_EMAIL_FROM is not configured."
        : "NOTIFICATIONS_EMAIL_FROM is not configured.",
    );
  }

  const replyTo =
    params.replyTo ??
    (fromKind === "booking" ? getBookingReplyEmail() : Deno.env.get("SHOP_SUPPORT_EMAIL") ?? null);

  const apiKey = (Deno.env.get("RESEND_API_KEY") ?? Deno.env.get("SMTP_PASS") ?? Deno.env.get("SMTP_PASSWORD") ?? "").trim();
  if (apiKey) {
    try {
      await sendViaResendApi({
        apiKey,
        from,
        replyTo,
        to: params.to,
        subject: params.subject,
        html: params.html,
        attachments: params.attachments,
      });
      return { provider: "resend" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Resend API send failed, trying SMTP fallback:", message);
    }
  }

  const smtp = getSmtpConfig();
  if (!smtp) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY (recommended) or SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and BOOKINGS_EMAIL_FROM / NOTIFICATIONS_EMAIL_FROM in Supabase secrets.",
    );
  }

  await sendViaSmtp({ smtp, from, to: params.to, subject: params.subject, html: params.html, attachments: params.attachments });
  return { provider: "smtp" };
}

export function requireEmailDeliveryConfig(): void {
  const status = getEmailDeliveryStatus();
  if (!status.from) {
    throw new Error("EMAIL_FROM is not configured.");
  }
  if (!status.resendApi && !status.smtp) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY or SMTP_* secrets in Supabase Edge Functions (separate from Auth SMTP).",
    );
  }
}

export function requireSmtpConfig(): SmtpConfig {
  requireEmailDeliveryConfig();
  const cfg = getSmtpConfig();
  if (!cfg && !(Deno.env.get("RESEND_API_KEY") ?? "").trim()) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM.");
  }
  return cfg ?? {
    host: "smtp.resend.com",
    port: "465",
    username: "resend",
    password: (Deno.env.get("RESEND_API_KEY") ?? "").trim(),
    from: getEmailFrom("notification") ?? "Velbok <notifications@velbok.com>",
  };
}

export function siteUrl(): string {
  return (Deno.env.get("SITE_URL") || "https://velbok.com").replace(/\/$/, "");
}

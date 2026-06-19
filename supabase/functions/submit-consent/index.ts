import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { degrees, PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import {
  callerIsOnlyCustomer,
  customerOwnsBooking,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/auth.ts";
import { getShopBranding } from "../_shared/branding.ts";
import { loadConsentFormTemplateBySlug, type ConsentFormContent } from "../_shared/consent-form-templates.ts";
import {
  applyConsentTemplateVars,
} from "../_shared/consent-template-text.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function decodeDataUrlToBytes(dataUrl: string): Uint8Array {
  const m = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!m) throw new Error("Invalid data URL");
  const base64 = m[2];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function drawWrappedText(params: {
  page: any;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  size: number;
  font: any;
  lineHeight?: number;
  color?: any;
}) {
  const { page, text, x, y, maxWidth, size, font, lineHeight = size * 1.35, color } = params;
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  let cursorY = y;
  for (const line of lines) {
    page.drawText(line, { x, y: cursorY, size, font, color: color ?? rgb(0.1, 0.1, 0.1) });
    cursorY -= lineHeight;
  }
  return cursorY;
}

function countWrappedLines(text: string, maxWidth: number, size: number, font: any): number {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let lines = 0;
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      if (current) lines++;
      current = w;
    }
  }
  if (current) lines++;
  return Math.max(1, lines);
}

/** Vertical space used by a wrapped block (matches `drawWrappedText`). */
function blockHeight(lines: number, lineHeight: number): number {
  return lines * lineHeight;
}

function advanceAfterWrapped(yTop: number, yBottom: number, gapAfter: number): number {
  return yBottom - gapAfter;
}

/** Move y down after a single-line label (baseline at y). */
function dropAfterLine(y: number, fontSize: number, gapAfter = 5): number {
  return y - fontSize * 1.28 - gapAfter;
}

/** Short appointment line to avoid tall ISO timestamps wrapping across many lines. */
function formatAppointmentShort(starts?: string, ends?: string): string {
  if (!starts?.trim()) return "";
  const sMs = Date.parse(starts);
  if (Number.isNaN(sMs)) return `Appointment: ${starts}${ends?.trim() ? ` – ${ends}` : ""}`;
  const s = new Date(sMs);
  const datePart = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(s);
  const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const tS = timeFmt.format(s);
  if (ends?.trim()) {
    const eMs = Date.parse(ends);
    if (!Number.isNaN(eMs)) {
      const e = new Date(eMs);
      return `Appointment: ${datePart}, ${tS}–${timeFmt.format(e)}`;
    }
  }
  return `Appointment: ${datePart}, ${tS}`;
}

type ConsentLayout = {
  headerSize: number;
  headerLine: number;
  titleSize: number;
  titleGap: number;
  artistSize: number;
  artistGap: number;
  introSize: number;
  introLine: number;
  introGap: number;
  sectionTitleSize: number;
  qSize: number;
  qLine: number;
  qRowGap: number;
  healthHeaderGap: number;
  declSize: number;
  declLine: number;
  declItemGap: number;
  declSectionGap: number;
  dSize: number;
  dLine: number;
  dItemGap: number;
  clientSectionGap: number;
};

function layoutForScale(scale: number, _consentType: "tattoo" | "piercing"): ConsentLayout {
  const s = scale;
  const declBase = 6.75;
  return {
    headerSize: 10 * s,
    headerLine: 11 * s,
    titleSize: 11.5 * s,
    titleGap: 13 * s,
    artistSize: 8.5 * s,
    artistGap: 11 * s,
    introSize: 8.25 * s,
    introLine: 10 * s,
    introGap: 8 * s,
    sectionTitleSize: 8.5 * s,
    qSize: 7.5 * s,
    qLine: 9.25 * s,
    qRowGap: 5 * s,
    healthHeaderGap: 6 * s,
    declSize: declBase * s,
    declLine: (declBase + 1.35) * s,
    declItemGap: 5 * s,
    declSectionGap: 6 * s,
    dSize: 7.75 * s,
    dLine: 9 * s,
    dItemGap: 4 * s,
    clientSectionGap: 9 * s,
  };
}

async function buildConsentPdf(params: {
  template: ConsentFormContent;
  templateSlug: string;
  fullName: string;
  clientEmail: string;
  phone: string;
  artistName?: string;
  shopName?: string;
  bookingStartsAt?: string;
  bookingEndsAt?: string;
  consentFields: Record<string, unknown>;
  signatureImage: string;
}) {
  const { template, templateSlug, fullName, clientEmail, phone, artistName, shopName, bookingStartsAt, bookingEndsAt, consentFields, signatureImage } = params;
  /** Portrait A4 (width < height). Explicit rotation 0° so viewers/printers never treat it as landscape. */
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const brand = getShopBranding();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${template.formTitle} — ${brand.shopName}`);
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  page.setRotation(degrees(0));

  const margin = 36;
  const contentW = PAGE_W - margin * 2;
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  /** Signature box (~75% width); fixed height at page foot. */
  const sigBoxH = 39;
  const sigBoxW = contentW * 0.75;
  const sigBoxX = margin + (contentW - sigBoxW) / 2;
  const sigLabelGap = 10;
  const gapBeforeSig = 10;
  /** Lowest y for body text (above “Signature:” label + box). */
  const signatureZoneTop = (sectionTitleLead: number) =>
    margin + sigBoxH + sigLabelGap + sectionTitleLead + gapBeforeSig;

  const fields = consentFields as Record<string, unknown>;
  const treatmentLocation =
    (typeof fields.treatmentLocation === "string" && fields.treatmentLocation.trim()) ||
    (typeof fields.tattooPlacement === "string" && fields.tattooPlacement.trim()) ||
    "";
  const address = typeof fields.address === "string" ? fields.address : "";
  const dob = typeof fields.dob === "string" ? fields.dob : "";
  const guardianName = typeof fields.guardianName === "string" ? fields.guardianName : "";
  const startWindow = formatAppointmentShort(bookingStartsAt, bookingEndsAt);
  const locLabel = template.placementLabel;
  const detailLines = [
    ...(shopName?.trim() ? [`Studio / organization: ${shopName.trim()}`] : []),
    ...(artistName?.trim() ? [`Artist / practitioner: ${artistName.trim()}`] : []),
    `Full name (print): ${fullName}`,
    `Address: ${address}`,
    `Date of birth: ${dob}`,
    `Email: ${clientEmail}`,
    `Phone no: ${phone}`,
    `${locLabel} ${treatmentLocation}`,
    ...(startWindow ? [startWindow] : []),
    ...(guardianName ? [`Parent / legal guardian: ${guardianName}`] : []),
  ];

  const markColW = 52;
  const qTextW = contentW - markColW - 8;
  const resolvedTemplate = applyConsentTemplateVars(template, { shopName, artistName }, templateSlug);
  const intro = resolvedTemplate.introText;
  const statements = resolvedTemplate.statements;
  const orgLine = shopName?.trim() || "";
  const practitionerLine = artistName?.trim() || "";

  const measureHeader = (scale: number): number => {
    const L = layoutForScale(scale, templateSlug === "piercing" ? "piercing" : "tattoo");
    const subSize = 7 * scale;
    let y = PAGE_H - margin;
    y = dropAfterLine(y, L.headerSize, 6);
    y = dropAfterLine(y, subSize, 4);
    y = dropAfterLine(y, subSize, 8);
    y = dropAfterLine(y, L.titleSize, 6);
    if (orgLine) y = dropAfterLine(y, L.artistSize, 6);
    if (practitionerLine) y = dropAfterLine(y, L.artistSize, 6);
    return y;
  };

  const sectionLead = (L: ConsentLayout) => L.sectionTitleSize * 1.15;

  const declColumns = template.declColumns;

  const measureDeclarationsDrop = (startY: number, scale: number, L: ConsentLayout): number => {
    const colGap = 6;
    const declColW = declColumns === 1 ? contentW : (contentW - colGap) / 2;
    const perCol = Math.ceil(statements.length / declColumns);
    const chunks: string[][] = [];
    for (let c = 0; c < declColumns; c++) {
      chunks.push(statements.slice(c * perCol, (c + 1) * perCol));
    }
    let y = startY;
    for (let i = 0; i < perCol; i++) {
      let minEnd = y;
      for (let c = 0; c < declColumns; c++) {
        const st = chunks[c][i];
        if (!st) continue;
        const yEnd = y - blockHeight(countWrappedLines(`- ${st}`, declColW, L.declSize, fontRegular), L.declLine);
        minEnd = Math.min(minEnd, yEnd);
      }
      y = minEnd - L.declItemGap;
    }
    return startY - y + 3 * scale;
  };

  const measureEndY = (scale: number): number => {
    const L = layoutForScale(scale, templateSlug === "piercing" ? "piercing" : "tattoo");
    const lead = sectionLead(L);
    let y = measureHeader(scale);
    y -= blockHeight(countWrappedLines(intro, contentW, L.introSize, fontRegular), L.introLine);
    y -= L.introGap;
    y -= lead;
    y -= L.healthHeaderGap;
    for (const q of template.healthQuestions) {
      y -= blockHeight(countWrappedLines(q, qTextW, L.qSize, fontRegular), L.qLine);
      y -= L.qRowGap;
    }
    y -= 4 * scale;
    y -= lead;
    y -= L.declSectionGap;
    y -= measureDeclarationsDrop(y, scale, L);
    y -= lead;
    y -= L.clientSectionGap;
    for (const line of detailLines) {
      y -= blockHeight(countWrappedLines(line, contentW, L.dSize, fontRegular), L.dLine);
      y -= L.dItemGap;
    }
    return y;
  };

  const minGapAboveSignature = 10;
  let scale = 1.04;
  const maxScale = 1.24;
  const minScale = 0.9;
  for (let i = 0; i < 24; i++) {
    const Ls = layoutForScale(scale, templateSlug === "piercing" ? "piercing" : "tattoo");
    const floorY = signatureZoneTop(sectionLead(Ls));
    const endY = measureEndY(scale);
    if (endY > floorY + minGapAboveSignature + 8 && scale < maxScale) {
      scale += 0.02;
    } else if (endY < floorY + minGapAboveSignature - 1 && scale > minScale) {
      scale -= 0.025;
    } else {
      break;
    }
  }
  const Ltest = layoutForScale(scale, templateSlug === "piercing" ? "piercing" : "tattoo");
  const contentFloorY = signatureZoneTop(sectionLead(Ltest));
  if (measureEndY(scale) < contentFloorY + minGapAboveSignature - 1) {
    throw new Error("Consent PDF does not fit on one page; contact support.");
  }

  const L = layoutForScale(scale, templateSlug === "piercing" ? "piercing" : "tattoo");
  const yesX = PAGE_W - margin - markColW;
  const noX = PAGE_W - margin - 22;
  const answers = ((consentFields.healthAnswers as Record<string, unknown>) || {}) as Record<string, unknown>;

  const subSize = 7 * scale;
  let y = PAGE_H - margin;

  page.drawText(brand.tradingName.toUpperCase(), { x: margin, y, size: L.headerSize, font: fontBold, color: rgb(0.08, 0.08, 0.08) });
  y = dropAfterLine(y, L.headerSize, 6);
  if (brand.websiteUrl) {
    page.drawText(brand.websiteUrl, { x: margin, y, size: subSize, font: fontRegular, color: rgb(0.28, 0.28, 0.28) });
    y = dropAfterLine(y, subSize, 4);
  }
  if (brand.address) {
    page.drawText(brand.address, { x: margin, y, size: subSize, font: fontRegular, color: rgb(0.28, 0.28, 0.28) });
    y = dropAfterLine(y, subSize, 4);
  }
  y -= 8 * scale;

  const title = template.pdfTitle;
  page.drawText(title, { x: margin, y, size: L.titleSize, font: fontBold, color: rgb(0.08, 0.08, 0.08) });
  y = dropAfterLine(y, L.titleSize, 6);
  if (orgLine) {
    page.drawText(`Studio / organization: ${orgLine}`, { x: margin, y, size: L.artistSize, font: fontRegular });
    y = dropAfterLine(y, L.artistSize, 6);
  }
  if (practitionerLine) {
    page.drawText(`Artist / practitioner: ${practitionerLine}`, { x: margin, y, size: L.artistSize, font: fontRegular });
    y = dropAfterLine(y, L.artistSize, 6);
  }

  y = drawWrappedText({ page, text: intro, x: margin, y, maxWidth: contentW, size: L.introSize, font: fontRegular, lineHeight: L.introLine });
  y -= L.introGap;

  const lead = sectionLead(L);

  page.drawText("Do you suffer from or are you:", { x: margin, y, size: L.sectionTitleSize, font: fontBold });
  page.drawText("Yes", { x: yesX, y, size: L.sectionTitleSize - 0.5, font: fontBold });
  page.drawText("No", { x: noX, y, size: L.sectionTitleSize - 0.5, font: fontBold });
  y -= lead;
  y -= L.healthHeaderGap;

  for (const q of template.healthQuestions) {
    const rowTop = y;
    const raw = answers[q];
    const yEnd = drawWrappedText({
      page,
      text: q,
      x: margin,
      y: rowTop,
      maxWidth: qTextW,
      size: L.qSize,
      font: fontRegular,
      lineHeight: L.qLine,
    });
    page.drawText(raw === true ? "X" : "", { x: yesX, y: rowTop, size: L.sectionTitleSize, font: fontBold });
    page.drawText(raw === false ? "X" : "", { x: noX, y: rowTop, size: L.sectionTitleSize, font: fontBold });
    y = advanceAfterWrapped(rowTop, yEnd, L.qRowGap);
  }
  y -= 4 * scale;

  page.drawText("Consent declarations:", { x: margin, y, size: L.sectionTitleSize, font: fontBold });
  y -= lead;
  y -= L.declSectionGap;

  {
    const colGap = 6;
    const declColW = declColumns === 1 ? contentW : (contentW - colGap) / 2;
    const perCol = Math.ceil(statements.length / declColumns);
    const chunks: string[][] = [];
    for (let c = 0; c < declColumns; c++) {
      chunks.push(statements.slice(c * perCol, (c + 1) * perCol));
    }
    for (let i = 0; i < perCol; i++) {
      const rowTop = y;
      let minEnd = rowTop;
      for (let c = 0; c < declColumns; c++) {
        const st = chunks[c][i];
        if (!st) continue;
        const xCol = margin + c * (declColW + colGap);
        const yEnd = drawWrappedText({
          page,
          text: `- ${st}`,
          x: xCol,
          y: rowTop,
          maxWidth: declColW,
          size: L.declSize,
          font: fontRegular,
          lineHeight: L.declLine,
        });
        minEnd = Math.min(minEnd, yEnd);
      }
      y = minEnd - L.declItemGap;
    }
    y -= 3 * scale;
  }

  page.drawText("Client details:", { x: margin, y, size: L.sectionTitleSize, font: fontBold });
  y -= lead;
  y -= L.clientSectionGap;

  for (const line of detailLines) {
    const blockTop = y;
    const yEnd = drawWrappedText({ page, text: line, x: margin, y: blockTop, maxWidth: contentW, size: L.dSize, font: fontRegular, lineHeight: L.dLine });
    y = advanceAfterWrapped(blockTop, yEnd, L.dItemGap);
  }

  if (y < contentFloorY + minGapAboveSignature - 1) {
    throw new Error("Consent PDF does not fit on one page; contact support.");
  }

  const sigBytes = decodeDataUrlToBytes(signatureImage);
  const signaturePng = await pdfDoc.embedPng(sigBytes);
  const boxPad = 4;
  const sigBoxBottom = margin;
  const sigBoxTop = sigBoxBottom + sigBoxH;

  const sigLabelY = sigBoxTop + sigLabelGap;
  if (y < sigLabelY + lead) {
    throw new Error("Consent PDF does not fit on one page; contact support.");
  }

  const dateStr = `Date: ${new Date().toISOString().slice(0, 10)}`;
  const dateSize = 7.5 * scale;
  page.drawText("Signature:", { x: margin, y: sigLabelY, size: L.sectionTitleSize, font: fontBold });
  page.drawText(dateStr, {
    x: margin + contentW - fontRegular.widthOfTextAtSize(dateStr, dateSize),
    y: sigLabelY,
    size: dateSize,
    font: fontRegular,
  });

  const sigInnerW = sigBoxW - boxPad * 2;
  const sigInnerH = sigBoxH - boxPad * 2;
  let sigDrawW = sigInnerW;
  let sigDrawH = (signaturePng.height / Math.max(signaturePng.width, 1)) * sigDrawW;
  if (sigDrawH > sigInnerH) {
    sigDrawH = sigInnerH;
    sigDrawW = (signaturePng.width / Math.max(signaturePng.height, 1)) * sigDrawH;
  }
  const sigX = sigBoxX + boxPad + (sigInnerW - sigDrawW) / 2;
  const sigY = sigBoxBottom + boxPad + (sigInnerH - sigDrawH) / 2;

  page.drawRectangle({
    x: sigBoxX,
    y: sigBoxBottom,
    width: sigBoxW,
    height: sigBoxH,
    borderWidth: 0.75,
    borderColor: rgb(0.45, 0.45, 0.45),
  });
  page.drawImage(signaturePng, { x: sigX, y: sigY, width: sigDrawW, height: sigDrawH });

  if (pdfDoc.getPages().length !== 1) {
    throw new Error("Consent PDF generation produced multiple pages.");
  }

  return pdfDoc.save();
}

async function trySendEmail(params: {
  apiKey: string | null;
  from: string | null;
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { apiKey, from, to, subject, html } = params;
  if (!apiKey || !from) return;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Email send failed:", res.status, text);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const authResult = await requireAuthenticatedUser(adminClient, req);
    if ("status" in authResult) {
      return jsonResponse(authResult.body, authResult.status);
    }

    const body = await req.json().catch(() => ({}));

    const bookingId = body.bookingId as string | undefined;
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const templateSlugRaw =
      typeof body.templateSlug === "string"
        ? body.templateSlug.trim().toLowerCase()
        : body.consentType === "piercing"
          ? "piercing"
          : typeof body.consentType === "string"
            ? body.consentType.trim().toLowerCase()
            : "tattoo";
    const templateSlug = templateSlugRaw || "tattoo";
    const signatureImage = typeof body.signatureImage === "string" ? body.signatureImage : "";
    const consentFields = body.consentFields ?? {};

    const loadedTemplate = await loadConsentFormTemplateBySlug(adminClient, templateSlug);
    if (!loadedTemplate) {
      return jsonResponse({ error: `Consent form "${templateSlug}" not found or inactive` }, 404);
    }
    const agreementVersion =
      typeof body.agreementVersion === "string" ? body.agreementVersion : loadedTemplate.version;
    const template = loadedTemplate.content;

    if (!bookingId) throw new Error("bookingId is required");
    if (!fullName) throw new Error("fullName is required");
    if (!signatureImage) throw new Error("signatureImage is required");

    const { data: booking, error: bookingErr } = await adminClient
      .from("bookings")
      .select(
        "id, artist_id, organization_id, client_user_id, client_email, client_name, client_phone, reference_image_url, starts_at, ends_at",
      )
      .eq("id", bookingId)
      .single();

    if (bookingErr || !booking) {
      return new Response(JSON.stringify({ error: bookingErr?.message ?? "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isCustomer = await callerIsOnlyCustomer(adminClient, authResult.user.id);
    if (!isCustomer) {
      return jsonResponse({ error: "Forbidden", reason: "consent_customers_only" }, 403);
    }
    if (!customerOwnsBooking(booking, authResult.user)) {
      return jsonResponse({ error: "Forbidden", reason: "booking_not_owned" }, 403);
    }

    const artistId = (booking as any).artist_id as string;
    const clientEmail = ((email && email.includes("@")) ? email : (booking as any).client_email) as string | null;

    if (!clientEmail) throw new Error("Client email is missing. Add an email to the booking first.");

    const { data: artistUser, error: artistErr } = await adminClient.auth.admin.getUserById(artistId);
    if (artistErr) throw new Error(artistErr.message);
    const artistEmail = artistUser?.email as string | undefined;

    const fieldsIn = (consentFields || {}) as Record<string, unknown>;
    let artistName =
      typeof fieldsIn.artistName === "string" ? fieldsIn.artistName.trim() : "";
    if (!artistName) {
      const { data: artistProfile } = await adminClient
        .from("profiles")
        .select("display_name")
        .eq("user_id", artistId)
        .maybeSingle();
      artistName = (artistProfile?.display_name as string | undefined)?.trim() ?? "";
    }

    let shopName = typeof fieldsIn.shopName === "string" ? fieldsIn.shopName.trim() : "";
    if (!shopName) {
      const orgId = (booking as { organization_id?: string | null }).organization_id;
      if (orgId) {
        const { data: shopRow } = await adminClient
          .from("shop_settings")
          .select("shop_name, trading_name")
          .eq("organization_id", orgId)
          .maybeSingle();
        shopName =
          ((shopRow?.trading_name as string | undefined)?.trim() ||
            (shopRow?.shop_name as string | undefined)?.trim()) ??
          "";
        if (!shopName) {
          const { data: orgRow } = await adminClient.from("organizations").select("name").eq("id", orgId).maybeSingle();
          shopName = ((orgRow?.name as string | undefined)?.trim()) ?? "";
        }
      }
    }
    if (!shopName) shopName = getShopBranding().shopName;

    const { data: consentData, error: consentErr } = await adminClient
      .from("consent_signatures")
      .insert({
        full_name: fullName,
        email: clientEmail,
        phone: phone || null,
        signature_image: signatureImage,
        agreement_version: agreementVersion,
        client_acknowledged: true,
        booking_id: bookingId,
        artist_id: artistId,
        reference_image_url: null,
        consent_fields: {
          ...(typeof consentFields === "object" && consentFields !== null
            ? (consentFields as Record<string, unknown>)
            : {}),
          consentType: templateSlug,
          templateSlug,
        },
        consent_template_id: loadedTemplate.id ?? null,
        consent_template_slug: templateSlug,
      })
      .select("id")
      .single();

    if (consentErr || !consentData) {
      return new Response(JSON.stringify({ error: consentErr?.message ?? "Consent insert failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const consentId = (consentData as any).id as string;
    let consentPdfUrl: string | null = null;
    let pdfUploadError: string | null = null;
    let pdfGenerationError: string | null = null;

    const envBucket = (Deno.env.get("CONSENT_TEMPLATE_BUCKET") ?? "").trim();
    const bucketCandidates = [envBucket || "uploads", "uploads"].filter((b, i, a) => b && a.indexOf(b) === i);

    try {
      const filledBytes = await buildConsentPdf({
        template,
        templateSlug,
        fullName,
        clientEmail,
        phone,
        artistName,
        shopName,
        bookingStartsAt: (booking as any).starts_at,
        bookingEndsAt: (booking as any).ends_at,
        consentFields: (consentFields || {}) as Record<string, unknown>,
        signatureImage,
      });

      const destPath = `consent_submissions/${consentId}.pdf`;

      for (const bucket of bucketCandidates) {
        const { error: upErrUint } = await adminClient.storage.from(bucket).upload(destPath, filledBytes, {
          contentType: "application/pdf",
          upsert: true,
        });
        if (!upErrUint) {
          consentPdfUrl = `uploads:${destPath}`;
          pdfUploadError = null;
          break;
        }
        const pdfBlob = new Blob([filledBytes], { type: "application/pdf" });
        const { error: upErrBlob } = await adminClient.storage.from(bucket).upload(destPath, pdfBlob, {
          contentType: "application/pdf",
          upsert: true,
        });
        if (!upErrBlob) {
          consentPdfUrl = `uploads:${destPath}`;
          pdfUploadError = null;
          break;
        }
        pdfUploadError = `${bucket}: ${upErrBlob.message || upErrUint.message || "upload failed"}`;
        console.error("Consent PDF upload failed for bucket", bucket, upErrUint, upErrBlob);
      }
    } catch (e) {
      pdfGenerationError = e instanceof Error ? e.message : String(e);
      console.error("Consent PDF generation failed:", e);
    }

    if (consentPdfUrl) {
      await adminClient.from("consent_signatures").update({ consent_pdf_url: consentPdfUrl }).eq("id", consentId);
    }

    // Email both client + artist (if configured).
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? null;
    const emailFrom = Deno.env.get("EMAIL_FROM") ?? null;

    const startsAt = (booking as any).starts_at as string | undefined;
    const endsAt = (booking as any).ends_at as string | undefined;
    const brand = getShopBranding();
    const subject = `${loadedTemplate.name} submitted — ${brand.shopName}`;

    const bookingHtml = startsAt
      ? `<p>Appointment: <strong>${startsAt}</strong> ${endsAt ? `– ${endsAt}` : ""}</p>`
      : "";

    const pdfLinkHtml = consentPdfUrl
      ? `<p><a href="${consentPdfUrl}" target="_blank" rel="noreferrer">View signed consent PDF</a></p>`
      : "<p>(PDF not available — signature recorded successfully.)</p>";

    const commonHtml = `
      <div>
        <p>Hi,</p>
        <p>${fullName} has submitted the ${loadedTemplate.name} consent form.</p>
        ${bookingHtml}
        ${pdfLinkHtml}
        <p>Thank you,<br/>${brand.shopName}</p>
      </div>
    `;

    await trySendEmail({
      apiKey: resendApiKey,
      from: emailFrom,
      to: clientEmail,
      subject,
      html: commonHtml,
    });

    if (artistEmail) {
      await trySendEmail({
        apiKey: resendApiKey,
        from: emailFrom,
        to: artistEmail,
        subject,
        html: commonHtml,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        consentId,
        consentPdfUrl,
        pdfSaved: !!consentPdfUrl,
        pdfUploadError,
        pdfGenerationError,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


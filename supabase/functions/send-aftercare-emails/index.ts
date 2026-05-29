import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import nodemailer from "npm:nodemailer@6.9.15";
import { jsonCorsHeaders, requireCronAuth } from "../_shared/auth.ts";
import { emailBrandHeaderLarge, getShopBranding } from "../_shared/branding.ts";

const corsHeaders = jsonCorsHeaders;

type AftercareKind = "tattoo" | "piercing";

type BookingRow = {
  id: string;
  client_name: string;
  client_email: string | null;
  booking_type: string;
  service_category: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

type ServiceRow = {
  booking_type: string;
  service_category: string;
  duration: number;
  name: string;
};

function bookingDurationMinutes(startsAt: string, endsAt: string): number {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 60000);
}

/** Match booking to a service preset (same rules as the schedule UI). */
function bookingTypesMatchForService(
  bookingType: string,
  serviceBookingType: string,
  bookingCategory?: string,
  serviceCategory?: string,
): boolean {
  const bt = String(bookingType || "session").toLowerCase();
  const st = String(serviceBookingType || "session").toLowerCase();
  if (bt === st) return true;
  const bc = (bookingCategory || "").toLowerCase();
  const sc = (serviceCategory || "").toLowerCase();
  if (bt === "session" && st === "piercing-session" && bc === "piercing") return true;
  if (bt === "piercing-session" && st === "session" && sc === "piercing") return true;
  if (bt === "session" && st === "laser-session" && bc === "laser") return true;
  if (bt === "laser-session" && st === "session" && sc === "laser") return true;
  return false;
}

function inferServiceCategory(services: ServiceRow[], booking: BookingRow): string | null {
  if (services.length === 0) return null;
  const typeNorm = String(booking.booking_type || "session").toLowerCase();
  const catNorm = String(booking.service_category || "").toLowerCase();
  const dur = bookingDurationMinutes(booking.starts_at, booking.ends_at);

  let pool = services.filter((s) =>
    bookingTypesMatchForService(typeNorm, s.booking_type, catNorm, s.service_category),
  );
  if (pool.length === 0) pool = [...services];

  const exact = pool.filter((s) => s.duration === dur);
  let match: ServiceRow | undefined;
  if (exact.length === 1) {
    match = exact[0];
  } else if (exact.length > 1) {
    match = [...exact].sort((a, b) => a.name.localeCompare(b.name))[0];
  } else if (dur > 0) {
    match = [...pool].sort(
      (a, b) => Math.abs(a.duration - dur) - Math.abs(b.duration - dur) || a.name.localeCompare(b.name),
    )[0];
  } else {
    match = pool[0];
  }

  return match?.service_category?.toLowerCase() ?? null;
}

function aftercareKindForBooking(
  b: Pick<BookingRow, "service_category" | "booking_type">,
  inferredCategory: string | null,
): AftercareKind | null {
  const cat = (inferredCategory || b.service_category || "").toLowerCase();
  if (cat === "piercing") return "piercing";
  if (cat === "tattoo") return "tattoo";
  if (cat === "laser" || cat === "consultation") return null;

  const bt = (b.booking_type || "").toLowerCase();
  if (bt === "piercing-session" || bt.includes("piercing")) return "piercing";
  if (bt === "laser-session" || bt.includes("laser")) return null;
  if (bt === "session" || bt === "touch-up" || bt.includes("tattoo")) return "tattoo";
  return null;
}

function fmtBookingWindow(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
  const startTime = start.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  const endTime = end.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  return `${date}, ${startTime} - ${endTime}`;
}

async function sendMail(params: {
  host: string | null;
  port: string | null;
  username: string | null;
  password: string | null;
  from: string | null;
  to: string;
  subject: string;
  html: string;
}) {
  const { host, port, username, password, from, to, subject, html } = params;
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
  await transporter.sendMail({ from, to, subject, html });
}

function tattooAftercareHtml(clientName: string, bookingWindow: string): string {
  const brand = getShopBranding();
  const helpLink = brand.websiteUrl
    ? `<p style="margin:0;font-size:13px;color:#c7c7c7;">Need help? <a href="${brand.websiteUrl}" style="color:${brand.accentColor};">${brand.websiteUrl}</a></p>`
    : brand.supportEmail
      ? `<p style="margin:0;font-size:13px;color:#c7c7c7;">Need help? <a href="mailto:${brand.supportEmail}" style="color:${brand.accentColor};">${brand.supportEmail}</a></p>`
      : "";
  return `
    <div style="margin:0;background:#0b0b0d;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#ececec;">
      <div style="max-width:700px;margin:0 auto;background:#121216;border:1px solid #222;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.35);">
        <div style="padding:20px 24px;background:linear-gradient(180deg,#1a1a1f,#101014);text-align:center;">
          ${emailBrandHeaderLarge(brand)}
          <div style="margin-top:6px;font-size:12px;letter-spacing:.3px;color:#c7c7c7;">Tattoo Aftercare</div>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 10px;font-size:14px;">Hi ${clientName},</p>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#d7d7d7;">Thank you for booking with ${brand.shopName}. Your appointment is now starting: <strong>${bookingWindow}</strong>.</p>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#d7d7d7;">We like to stay in contact with our clients throughout the healing process. If you have concerns, send us clear photos of your tattoo and we will guide you. Every skin type is different, so always follow your artist's advice.</p>

          <h3 style="margin:16px 0 10px;font-size:15px;color:#f4c24d;">IMPORTANT GUIDELINES</h3>
          <ul style="margin:0 0 12px 18px;padding:0;line-height:1.65;color:#e8e8e8;font-size:13px;">
            <li>Wash hands thoroughly before touching your tattoo.</li>
            <li>Do not pick or scratch scabs; this can cause color loss and patchy healing.</li>
            <li>Do not soak in the bath and avoid swimming until fully healed.</li>
            <li>Avoid direct contact with pets. If pets sleep in bed, use fresh sheets and keep animals out during healing.</li>
            <li>Use only a very small amount of cream. The tattoo should be moisturized, not shiny or greasy.</li>
          </ul>

          <h3 style="margin:16px 0 10px;font-size:15px;color:#f4c24d;">AFTERCARE ROUTINE</h3>
          <ol style="margin:0 0 12px 18px;padding:0;line-height:1.65;color:#e8e8e8;font-size:13px;">
            <li>Wash your hands thoroughly.</li>
            <li>Remove cling film after 2-4 hours, or as soon as it is safe in a clean place with clean water and soap. Do not remove it in pubs or unsanitary places.</li>
            <li>Wash gently with lukewarm water. If you have a hot water tank (not a combi boiler), use cool/cold water instead.</li>
            <li>Do not apply numbing cream, alcohol, natural oils, or homemade remedies.</li>
            <li>Use mild soap (Dove or similar). No antibacterial soap, shower gel, shampoo, or sponges.</li>
            <li>Rinse thoroughly and pat dry with clean paper towel only. Do not use toilet paper.</li>
            <li>After this first wash, do not apply any cream. Leave the tattoo clean and dry.</li>
            <li>The following morning, wash your hands, wash the tattoo again, and pat dry.</li>
            <li>Continue washing twice daily, morning and evening. If needed, wash one extra time, but not more than 3 times per day.</li>
            <li>After each wash, leave it to air dry for 5 minutes, then apply a tiny amount of aftercare cream/Bepanthen.</li>
            <li>Continue this routine for around 14 days.</li>
            <li>For the first 3 days, it is safer to keep the tattoo on the drier side rather than over-moisturizing.</li>
          </ol>

          <h3 style="margin:16px 0 10px;font-size:15px;color:#f4c24d;">TISSUE CORNER TEST</h3>
          <ul style="margin:0 0 12px 18px;padding:0;line-height:1.65;color:#e8e8e8;font-size:13px;">
            <li>Place a tiny clean tissue corner on the tattoo.</li>
            <li>If it sticks, you used too much cream.</li>
            <li>If it falls off, the amount is correct.</li>
          </ul>

          <h3 style="margin:16px 0 10px;font-size:15px;color:#f4c24d;">SIGNS OF INFECTION</h3>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.65;color:#e8e8e8;">Signs of infection may include redness, swelling, and pain. This does not mean a little normal irritation, but severe or worsening symptoms.</p>
          <p style="margin:0 0 12px;font-size:13px;line-height:1.65;color:#e8e8e8;">In case of emergency, please seek immediate medical advice or go to A&amp;E.</p>
          ${helpLink}
        </div>
      </div>
    </div>`;
}

function piercingAftercareHtml(clientName: string, bookingWindow: string): string {
  const brand = getShopBranding();
  const helpLink = brand.websiteUrl
    ? `<p style="margin:0;font-size:13px;color:#c7c7c7;">Need help? <a href="${brand.websiteUrl}" style="color:${brand.accentColor};">${brand.websiteUrl}</a></p>`
    : brand.supportEmail
      ? `<p style="margin:0;font-size:13px;color:#c7c7c7;">Need help? <a href="mailto:${brand.supportEmail}" style="color:${brand.accentColor};">${brand.supportEmail}</a></p>`
      : "";
  return `
    <div style="margin:0;background:#0b0b0d;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#ececec;">
      <div style="max-width:700px;margin:0 auto;background:#121216;border:1px solid #222;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.35);">
        <div style="padding:20px 24px;background:linear-gradient(180deg,#1a1a1f,#101014);text-align:center;">
          ${emailBrandHeaderLarge(brand)}
          <div style="margin-top:6px;font-size:12px;letter-spacing:.3px;color:#c7c7c7;">Piercing Aftercare Guidelines</div>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 10px;font-size:14px;">Hi ${clientName},</p>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#d7d7d7;">Thank you for booking with ${brand.shopName}. Your appointment is now starting: <strong>${bookingWindow}</strong>.</p>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#d7d7d7;">Please follow your piercer advice. Most piercings require 14 to 24 months to fully heal, depending on placement, your body, and lifestyle.</p>

          <h3 style="margin:16px 0 10px;font-size:15px;color:#f4c24d;">DAILY CLEANING</h3>
          <ul style="margin:0 0 12px 18px;padding:0;line-height:1.65;color:#e8e8e8;font-size:13px;">
            <li>Clean hands first. Always wash your hands thoroughly before touching or cleaning your piercing.</li>
            <li>Clean the piercing daily. Discharge, pus, and granulomas can form within 2 days and may become infected very quickly if the piercing is not kept clean.</li>
            <li>Use sterile saline solution only. Avoid alcohol, hydrogen peroxide, harsh chemicals, oils, creams, and homemade remedies.</li>
            <li>Soak clean paper towel or sterile gauze with saline and gently clean around the piercing. Do not twist or play with the jewellery.</li>
            <li>Rinse with warm water after cleaning to remove leftover saline, crust, or discharge.</li>
            <li>Pat dry with clean disposable paper towel or sterile gauze. Avoid cotton pads or towels, as fibres can catch and carry bacteria.</li>
          </ul>

          <h3 style="margin:16px 0 10px;font-size:15px;color:#f4c24d;">WHAT TO AVOID</h3>
          <ul style="margin:0 0 12px 18px;padding:0;line-height:1.65;color:#e8e8e8;font-size:13px;">
            <li>Avoid excessive moisture. Keep the piercing dry and avoid wet clothing or towels sitting on it.</li>
            <li>Choose clean, loose, breathable clothing. Tight clothing can irritate, rub, or snag the piercing.</li>
            <li>Do not touch, twist, rotate, or play with jewellery unless needed for cleaning.</li>
            <li>Avoid cosmetics, lotions, makeup, creams, and sprays directly on or around the piercing.</li>
            <li>Avoid swimming for at least 2-3 weeks, or until your piercer says it is safe.</li>
          </ul>

          <h3 style="margin:16px 0 10px;font-size:15px;color:#f4c24d;">Important Notes</h3>
          <h4 style="margin:0 0 8px;font-size:13px;color:#f4c24d;">HEALING &amp; JEWELLERY</h4>
          <ul style="margin:0 0 12px 18px;padding:0;line-height:1.65;color:#e8e8e8;font-size:13px;">
            <li>Most piercings need 14 to 24 months to fully heal. Be patient and continue appropriate aftercare throughout healing.</li>
            <li>Do not change jewellery earlier than 14 months unless your piercer advises it.</li>
            <li>If the jewellery feels too tight, or swelling puts pressure on both ends, the jewellery must be sized up immediately by a piercer.</li>
            <li>For safe downsizing, upsizing, or jewellery changes, always contact your piercer.</li>
          </ul>
          <h4 style="margin:0 0 8px;font-size:13px;color:#f4c24d;">SPECIFIC PIERCINGS</h4>
          <ul style="margin:0 0 12px 18px;padding:0;line-height:1.65;color:#e8e8e8;font-size:13px;">
            <li>Ear piercings: avoid headphones, earbuds, and any mechanical trauma during healing. Impact or repeated pressure can contribute to cauliflower ear.</li>
            <li>Oral piercings: use an alcohol-free antimicrobial mouthwash after eating, drinking, smoking, or vaping if advised. Rinse gently and move jewellery only as advised.</li>
          </ul>

          <h3 style="margin:16px 0 10px;font-size:15px;color:#f4c24d;">SIGNS OF INFECTION</h3>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.65;color:#e8e8e8;">Signs of infection may include redness, swelling, and pain. This does not mean a little normal irritation, but severe or worsening symptoms.</p>
          <p style="margin:0 0 12px;font-size:13px;line-height:1.65;color:#e8e8e8;">In case of emergency, please seek immediate medical advice or go to A&amp;E.</p>
          ${helpLink}
        </div>
      </div>
    </div>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronDenied = requireCronAuth(req);
  if (cronDenied) return cronDenied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const smtpHost = Deno.env.get("SMTP_HOST") ?? null;
    const smtpPort = Deno.env.get("SMTP_PORT") ?? null;
    const smtpUser = Deno.env.get("SMTP_USER") ?? null;
    const smtpPass = Deno.env.get("SMTP_PASS") ?? Deno.env.get("SMTP_PASSWORD") ?? null;
    const emailFrom = Deno.env.get("EMAIL_FROM") ?? Deno.env.get("SMTP_FROM") ?? null;

    const admin = createClient(supabaseUrl, serviceKey);
    const nowMs = Date.now();
    const toleranceMs = 20 * 60 * 1000;
    const minDate = new Date(nowMs - toleranceMs).toISOString();
    const maxDate = new Date(nowMs + toleranceMs).toISOString();

    const { data: services, error: servicesErr } = await admin
      .from("services")
      .select("booking_type, service_category, duration, name")
      .eq("is_active", true);
    if (servicesErr) {
      return new Response(JSON.stringify({ error: servicesErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const serviceRows = (services || []) as ServiceRow[];

    const { data: bookings, error: bookingErr } = await admin
      .from("bookings")
      .select("id, client_name, client_email, booking_type, service_category, starts_at, ends_at, status")
      .gte("starts_at", minDate)
      .lte("starts_at", maxDate)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true });
    if (bookingErr) {
      return new Response(JSON.stringify({ error: bookingErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let checked = 0;
    let sent = 0;
    let skipped = 0;
    let failedCount = 0;
    const skipReasons: Array<{ bookingId: string; reason: string }> = [];

    for (const booking of (bookings || []) as BookingRow[]) {
      checked += 1;
      if (!booking.client_email) {
        skipped += 1;
        skipReasons.push({ bookingId: booking.id, reason: "no_client_email" });
        continue;
      }

      const inferredCategory = inferServiceCategory(serviceRows, booking);
      const aftercareKind = aftercareKindForBooking(booking, inferredCategory);
      if (!aftercareKind) {
        skipped += 1;
        skipReasons.push({
          bookingId: booking.id,
          reason: `no_aftercare_kind (category=${booking.service_category ?? "null"}, inferred=${inferredCategory ?? "null"}, type=${booking.booking_type})`,
        });
        continue;
      }

      const { data: existing } = await admin
        .from("booking_aftercare_events")
        .select("id")
        .eq("booking_id", booking.id)
        .eq("aftercare_type", aftercareKind)
        .eq("recipient_email", booking.client_email)
        .maybeSingle();
      if (existing?.id) {
        skipped += 1;
        skipReasons.push({ bookingId: booking.id, reason: `already_sent_${aftercareKind}` });
        continue;
      }

      const bookingWindow = fmtBookingWindow(booking.starts_at, booking.ends_at);
      const clientName = booking.client_name || "there";
      const brand = getShopBranding();
      const subject =
        aftercareKind === "tattoo"
          ? `Tattoo Aftercare — ${brand.tradingName}`
          : `Piercing Aftercare — ${brand.tradingName}`;
      const html =
        aftercareKind === "tattoo"
          ? tattooAftercareHtml(clientName, bookingWindow)
          : piercingAftercareHtml(clientName, bookingWindow);

      try {
        await sendMail({
          host: smtpHost,
          port: smtpPort,
          username: smtpUser,
          password: smtpPass,
          from: emailFrom,
          to: booking.client_email,
          subject,
          html,
        });
        sent += 1;
        await admin.from("booking_aftercare_events").insert({
          booking_id: booking.id,
          aftercare_type: aftercareKind,
          recipient_email: booking.client_email,
          status: "sent",
        } as any);
      } catch (e) {
        failedCount += 1;
        const message = e instanceof Error ? e.message : "Unknown aftercare send error";
        skipReasons.push({ bookingId: booking.id, reason: `send_failed: ${message}` });
        await admin.from("booking_aftercare_events").insert({
          booking_id: booking.id,
          aftercare_type: aftercareKind,
          recipient_email: booking.client_email,
          status: "failed",
          error_message: message,
        } as any);
      }
    }

    return new Response(
      JSON.stringify({ ok: failedCount === 0, checked, sent, skipped, failedCount, skipReasons }),
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


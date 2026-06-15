import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonCorsHeaders, requireCronAuth } from "../_shared/auth.ts";
import { getShopBranding } from "../_shared/branding.ts";
import { formatBookingDateRange, requireEmailDeliveryConfig, sendTransactionalEmail } from "../_shared/email.ts";
import { aftercareEmailSubject, buildAftercareEmail } from "../_shared/email-templates.ts";
import { loadShopAftercareTemplates } from "../_shared/shop-aftercare-templates.ts";
import { isImportedContactPlaceholderBooking } from "../_shared/imported-contacts.ts";

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
  notes?: string | null;
  suppress_booking_notifications?: boolean | null;
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

    requireEmailDeliveryConfig();

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
    const aftercareTemplates = await loadShopAftercareTemplates(admin, null);

    const { data: bookings, error: bookingErr } = await admin
      .from("bookings")
      .select("id, client_name, client_email, booking_type, service_category, starts_at, ends_at, status, notes, suppress_booking_notifications")
      .gte("starts_at", minDate)
      .lte("starts_at", maxDate)
      .neq("status", "cancelled")
      .eq("suppress_booking_notifications", false)
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
      if (isImportedContactPlaceholderBooking(booking)) {
        skipped += 1;
        skipReasons.push({ bookingId: booking.id, reason: "import_placeholder_booking" });
        continue;
      }
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

      const templateRow = aftercareTemplates.get(aftercareKind);
      if (!templateRow?.enabled) {
        skipped += 1;
        skipReasons.push({ bookingId: booking.id, reason: `aftercare_disabled_${aftercareKind}` });
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

      const bookingWindow = formatBookingDateRange(booking.starts_at, booking.ends_at);
      const clientName = booking.client_name || "there";
      const brand = getShopBranding();
      const subject = aftercareEmailSubject(templateRow, brand.tradingName);
      const html = buildAftercareEmail({
        kind: aftercareKind,
        clientName,
        bookingWindow,
        template: templateRow,
      });

      try {
        await sendTransactionalEmail({
          to: booking.client_email,
          subject,
          html,
          fromKind: "booking",
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


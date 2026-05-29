import type { Service } from "@/components/schedule/ServicePresets";
import { bookingTypesMatchForService } from "@/lib/bookingTypes";

export type BookingServiceLookup = {
  booking_type: string;
  starts_at: string;
  ends_at: string;
  service_category?: string | null;
};

function bookingDurationMinutes(startsAt: string, endsAt: string): number {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 60000);
}

/** Match stored booking to a service preset (duration + type + category). */
export function pickServiceIdForBooking(services: Service[], booking: BookingServiceLookup): string {
  if (services.length === 0) return "";
  const typeNorm = String(booking.booking_type || "session").toLowerCase();
  const dur = bookingDurationMinutes(booking.starts_at, booking.ends_at);
  const catNorm = String(booking.service_category || "").toLowerCase();

  let pool = services.filter((s) =>
    bookingTypesMatchForService(typeNorm, s.booking_type, {
      bookingCategory: catNorm,
      serviceCategory: String(s.service_category || "").toLowerCase(),
    }),
  );
  if (catNorm === "tattoo" || catNorm === "piercing" || catNorm === "laser" || catNorm === "consultation") {
    const byCat = pool.filter((s) => String(s.service_category || "tattoo").toLowerCase() === catNorm);
    if (byCat.length > 0) pool = byCat;
  }
  if (pool.length === 0) pool = [...services];

  const exact = pool.filter((s) => s.duration === dur);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) {
    return [...exact].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))[0].id;
  }

  if (dur > 0) {
    const sorted = [...pool].sort(
      (a, b) =>
        Math.abs(a.duration - dur) - Math.abs(b.duration - dur) ||
        a.sort_order - b.sort_order ||
        a.name.localeCompare(b.name),
    );
    return sorted[0].id;
  }

  return [...pool].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))[0]?.id ?? services[0].id;
}

export function getBookingServiceName(services: Service[], booking: BookingServiceLookup): string {
  const id = pickServiceIdForBooking(services, booking);
  const match = services.find((s) => s.id === id);
  if (match?.name) return match.name;

  const cat = String(booking.service_category || "").trim();
  if (cat) return cat.charAt(0).toUpperCase() + cat.slice(1);
  const bt = String(booking.booking_type || "session").replace(/-/g, " ");
  return bt.charAt(0).toUpperCase() + bt.slice(1);
}

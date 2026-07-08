/** Calendar types shown when creating services / bookings. */
export const BOOKING_TYPE_VALUES = [
  "session",
  "consultation",
  "touch-up",
  "piercing-session",
  "laser-session",
] as const;

export type BookingTypeValue = (typeof BOOKING_TYPE_VALUES)[number];

export const CALENDAR_TYPE_OPTIONS: { value: BookingTypeValue; label: string }[] = [
  { value: "session", label: "Tattoo Session" },
  { value: "consultation", label: "Consultation" },
  { value: "touch-up", label: "Touch-up" },
  { value: "piercing-session", label: "Piercing Session" },
  { value: "laser-session", label: "Laser Session" },
];

export const BLOCKER_KIND_VALUES = ["holiday", "private"] as const;
export type BlockerKindValue = (typeof BLOCKER_KIND_VALUES)[number];

export const BLOCKER_DURATION_OPTIONS = [30, 60, 120, 240, 480, 1440] as const;

export function isBlockerBooking(booking: { booking_type: string }): boolean {
  return (booking.booking_type || "").toLowerCase() === "blocker";
}

export function blockerKindLabel(category: string | null | undefined): string {
  const c = (category || "").toLowerCase();
  if (c === "holiday") return "Holiday";
  if (c === "private") return "Private";
  return "Blocked";
}

export const BOOKING_TYPE_STYLES: Record<string, string> = {
  consultation: "bg-blue-500/15 border-blue-500/30 text-blue-300",
  session: "bg-primary/15 border-primary/30 text-primary",
  "touch-up": "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  "piercing-session": "bg-pink-500/15 border-pink-500/30 text-pink-300",
  "laser-session": "bg-violet-500/15 border-violet-500/30 text-violet-300",
  blocker: "bg-slate-500/15 border-slate-500/30 text-slate-300",
};

export const BOOKING_TYPE_BADGE_STYLES: Record<string, string> = {
  session: "bg-primary/15 text-primary border-primary/25",
  consultation: "bg-blue-500/15 text-blue-300 border-blue-500/25",
  "touch-up": "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  "piercing-session": "bg-pink-500/15 text-pink-300 border-pink-500/25",
  "laser-session": "bg-violet-500/15 text-violet-300 border-violet-500/25",
  blocker: "bg-slate-500/15 text-slate-300 border-slate-500/25",
};

export function bookingTypeLabel(value: string): string {
  return CALENDAR_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value.replace(/-/g, " ");
}

/** i18n-aware label — pass result of useScheduleI18n().bookingTypeLabel when in React. */
export function bookingTypeLabelWith(value: string, labelFn: (v: string) => string): string {
  return labelFn(value);
}

/** Default service_category when staff picks a calendar type. */
export function defaultServiceCategoryForBookingType(bookingType: string): string {
  switch (bookingType) {
    case "piercing-session":
      return "piercing";
    case "laser-session":
      return "laser";
    case "consultation":
      return "consultation";
    default:
      return "tattoo";
  }
}

export type AftercareKind = "tattoo" | "piercing";

export function aftercareKindForBooking(
  booking: { booking_type: string; service_category?: string | null },
  inferredCategory?: string | null,
): AftercareKind | null {
  const cat = (inferredCategory || booking.service_category || "").toLowerCase();
  if (cat === "piercing") return "piercing";
  if (cat === "tattoo") return "tattoo";
  if (cat === "laser" || cat === "consultation") return null;

  const bt = (booking.booking_type || "").toLowerCase();
  if (bt === "piercing-session" || bt.includes("piercing")) return "piercing";
  if (bt === "laser-session" || bt.includes("laser")) return null;
  if (bt === "session" || bt === "touch-up" || bt.includes("tattoo")) return "tattoo";
  return null;
}

/** Match booking calendar type to a service preset (supports legacy session + category). */
export function bookingTypesMatchForService(
  bookingType: string,
  serviceBookingType: string,
  opts?: { bookingCategory?: string; serviceCategory?: string },
): boolean {
  const bt = String(bookingType || "session").toLowerCase();
  const st = String(serviceBookingType || "session").toLowerCase();
  if (bt === st) return true;

  const bc = (opts?.bookingCategory || "").toLowerCase();
  const sc = (opts?.serviceCategory || "").toLowerCase();

  if (bt === "session" && st === "piercing-session" && bc === "piercing") return true;
  if (bt === "piercing-session" && st === "session" && sc === "piercing") return true;
  if (bt === "session" && st === "laser-session" && bc === "laser") return true;
  if (bt === "laser-session" && st === "session" && sc === "laser") return true;

  return false;
}

export function bookingEligibleForConsent(booking: {
  service_category?: string | null;
  booking_type: string;
}): boolean {
  if (isBlockerBooking(booking)) return false;
  const cat = (booking.service_category || "").toLowerCase();
  if (cat === "tattoo" || cat === "piercing") return true;
  if (cat === "laser" || cat === "consultation") return false;

  const type = (booking.booking_type || "").toLowerCase();
  if (type === "piercing-session") return true;
  if (type === "laser-session" || type === "consultation") return false;
  return type.includes("piercing") || type.includes("tattoo") || type.includes("session") || type.includes("touch-up");
}

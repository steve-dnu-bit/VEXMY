/** Placeholder booking rows from legacy client import — not real appointments. */
export function isImportedContactPlaceholderBooking(booking: {
  booking_type?: string | null;
  notes?: string | null;
  suppress_booking_notifications?: boolean | null;
}): boolean {
  const notes = (booking.notes || "").trim().toLowerCase();
  const isImportNote =
    notes.startsWith("imported from csv") ||
    notes.startsWith("imported from json") ||
    notes.includes("contacts export");

  if (booking.booking_type === "consultation" && isImportNote) return true;

  return !!(booking.suppress_booking_notifications && booking.booking_type === "consultation" && isImportNote);
}

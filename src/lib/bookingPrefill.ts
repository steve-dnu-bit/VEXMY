/** Fields chosen in the sidebar before a time-slot click opens the booking dialog. */
export type SidebarBookingDraft = {
  serviceId?: string;
  artistId?: string;
};

/** Values passed into the booking dialog when a time slot is clicked. */
export type BookingPrefill = {
  date?: Date;
  hour?: number;
  minute?: number;
  artistId?: string;
  serviceId?: string;
};

export function buildBookingPrefillFromSlot(
  slot: { date: Date; hour: number; minute: number; artistId?: string },
  draft: SidebarBookingDraft,
): BookingPrefill {
  return {
    date: slot.date,
    hour: slot.hour,
    minute: slot.minute,
    artistId: slot.artistId ?? draft.artistId,
    serviceId: draft.serviceId,
  };
}

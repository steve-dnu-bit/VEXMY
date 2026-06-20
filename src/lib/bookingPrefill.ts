/** Draft fields accumulated from calendar, services, artists, and time-grid clicks. */
export type BookingPrefill = {
  date?: Date;
  hour?: number;
  minute?: number;
  artistId?: string;
  serviceId?: string;
};

export function mergeBookingPrefill(prev: BookingPrefill, patch: BookingPrefill): BookingPrefill {
  return { ...prev, ...patch };
}

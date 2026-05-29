-- Services use booking_type 'touch-up' (see seed); bookings CHECK must allow it or inserts fail.

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_type_check
  CHECK (booking_type IN ('consultation', 'session', 'touch-up'));

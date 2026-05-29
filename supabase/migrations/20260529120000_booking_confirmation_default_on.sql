-- Booking confirmation emails were off by default; studios expect them on when saving a booking.
ALTER TABLE public.reminder_settings
  ALTER COLUMN booking_confirmation SET DEFAULT true;

UPDATE public.reminder_settings
SET booking_confirmation = true
WHERE booking_confirmation = false;

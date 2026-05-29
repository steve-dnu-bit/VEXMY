-- Add piercing-session and laser-session calendar types for services + bookings.

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_type_check
  CHECK (booking_type IN (
    'consultation',
    'session',
    'touch-up',
    'piercing-session',
    'laser-session'
  ));

ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_booking_type_check;

ALTER TABLE public.services
  ADD CONSTRAINT services_booking_type_check
  CHECK (booking_type IN (
    'consultation',
    'session',
    'touch-up',
    'piercing-session',
    'laser-session'
  ));

-- Align existing piercing/laser presets and bookings with dedicated calendar types.
UPDATE public.services
SET booking_type = 'piercing-session'
WHERE service_category = 'piercing'
  AND booking_type = 'session';

UPDATE public.services
SET booking_type = 'laser-session'
WHERE service_category = 'laser'
  AND booking_type = 'session';

UPDATE public.bookings
SET booking_type = 'piercing-session'
WHERE service_category = 'piercing'
  AND booking_type = 'session';

UPDATE public.bookings
SET booking_type = 'laser-session'
WHERE service_category = 'laser'
  AND booking_type = 'session';

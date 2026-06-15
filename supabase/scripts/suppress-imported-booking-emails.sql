-- Emergency: stop booking emails for imported contact placeholder rows.
-- Safe to re-run.

-- 1) Mark all known import patterns
UPDATE public.bookings
SET suppress_booking_notifications = true
WHERE suppress_booking_notifications = false
  AND (
    notes ILIKE 'Imported from CSV%'
    OR notes ILIKE 'Imported from JSON%'
    OR notes ILIKE '%contacts export%'
  );

-- 2) Broader safety: consultation placeholders from bulk import (no real appointment)
UPDATE public.bookings
SET suppress_booking_notifications = true
WHERE suppress_booking_notifications = false
  AND booking_type = 'consultation'
  AND status = 'confirmed'
  AND deposit_paid IS TRUE
  AND client_email IS NOT NULL
  AND notes IS NOT NULL
  AND notes ILIKE '%import%';

-- Report remaining at-risk rows (should be 0)
SELECT
  count(*) FILTER (WHERE suppress_booking_notifications = false) AS still_unsuppressed_import_like,
  count(*) FILTER (WHERE suppress_booking_notifications = true) AS suppressed_total
FROM public.bookings
WHERE booking_type = 'consultation'
  AND (
    notes ILIKE '%import%'
    OR notes ILIKE '%contacts export%'
  );

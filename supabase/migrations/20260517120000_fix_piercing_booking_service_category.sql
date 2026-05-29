-- Piercing bookings often use booking_type 'session'; fix mis-labelled rows for aftercare/reminders.

-- Backfill piercing category when duration matches a piercing service (±5 min tolerance).
UPDATE public.bookings b
SET service_category = 'piercing'
FROM public.services s
WHERE s.service_category = 'piercing'
  AND lower(trim(b.booking_type)) = lower(trim(coalesce(s.booking_type, 'session')))
  AND abs(
    (EXTRACT(EPOCH FROM (b.ends_at - b.starts_at)) / 60)::int - s.duration
  ) <= 5
  AND b.service_category IS DISTINCT FROM 'piercing';

-- Piercing in placement/notes but still marked tattoo (e.g. manual entry).
UPDATE public.bookings
SET service_category = 'piercing'
WHERE service_category = 'tattoo'
  AND (
    coalesce(tattoo_placement, '') ILIKE '%pierc%'
    OR coalesce(notes, '') ILIKE '%pierc%'
  );

-- Manual "send now" runs previously wrote normal timing keys (e.g. 24h),
-- which could block the later scheduled run because of unique dedupe keys.
-- Re-label only off-window historical rows so configured scheduled reminders
-- (12h/24h/48h/etc) can send at the proper time again.

with candidate_events as (
  select
    e.id,
    e.reminder_timing,
    e.sent_at,
    b.starts_at,
    case e.reminder_timing
      when '1h' then interval '1 hour'
      when '3h' then interval '3 hours'
      when '12h' then interval '12 hours'
      when '24h' then interval '24 hours'
      when '48h' then interval '48 hours'
      when '72h' then interval '72 hours'
      when '1w' then interval '7 days'
      else null
    end as timing_interval
  from public.booking_reminder_events e
  join public.bookings b on b.id = e.booking_id
  where e.reminder_timing in ('1h','3h','12h','24h','48h','72h','1w')
)
update public.booking_reminder_events e
set reminder_timing = e.reminder_timing || '-manual'
from candidate_events c
where e.id = c.id
  and c.timing_interval is not null
  and abs(extract(epoch from (c.sent_at - (c.starts_at - c.timing_interval)))) > 5400; -- > 90 minutes from configured due time

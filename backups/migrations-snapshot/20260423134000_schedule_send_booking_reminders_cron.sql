-- Schedule automated reminder delivery for reminder_settings toggles.
-- Runs every 15 minutes and invokes the send-booking-reminders edge function.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  -- Ensure a single schedule exists, even after repeated deploys.
  if exists (
    select 1
    from cron.job
    where jobname = 'send-booking-reminders-every-15-min'
  ) then
    perform cron.unschedule('send-booking-reminders-every-15-min');
  end if;

  perform cron.schedule(
    'send-booking-reminders-every-15-min',
    '*/15 * * * *',
    $cron$
      select net.http_post(
        url := 'https://obxnxazrivonewlbyqap.supabase.co/functions/v1/send-booking-reminders',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $cron$
  );
end
$$;

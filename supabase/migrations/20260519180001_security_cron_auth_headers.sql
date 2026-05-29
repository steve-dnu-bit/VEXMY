-- Cron jobs must send CRON_SECRET (vault name: cron_secret).
-- Set the same value in Edge Function secrets: CRON_SECRET
-- Create once: SELECT vault.create_secret('<random-secret>', 'cron_secret', 'Cron auth for reminder/aftercare functions');

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  v_cron_secret text;
  v_headers jsonb;
BEGIN
  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_secret'
  LIMIT 1;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || coalesce(v_cron_secret, '')
  );

  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-booking-reminders-every-15-min'
  ) THEN
    PERFORM cron.unschedule('send-booking-reminders-every-15-min');
  END IF;

  PERFORM cron.schedule(
    'send-booking-reminders-every-15-min',
    '*/15 * * * *',
    format(
      $job$
        SELECT net.http_post(
          url := 'https://obxnxazrivonewlbyqap.supabase.co/functions/v1/send-booking-reminders',
          headers := %L::jsonb,
          body := '{}'::jsonb
        );
      $job$,
      v_headers::text
    )
  );

  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-aftercare-emails-every-15-min'
  ) THEN
    PERFORM cron.unschedule('send-aftercare-emails-every-15-min');
  END IF;

  PERFORM cron.schedule(
    'send-aftercare-emails-every-15-min',
    '*/15 * * * *',
    format(
      $job$
        SELECT net.http_post(
          url := 'https://obxnxazrivonewlbyqap.supabase.co/functions/v1/send-aftercare-emails',
          headers := %L::jsonb,
          body := '{}'::jsonb
        );
      $job$,
      v_headers::text
    )
  );
END
$$;

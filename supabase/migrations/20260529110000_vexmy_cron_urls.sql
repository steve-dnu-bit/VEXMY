-- Point pg_cron jobs at the VexMy Supabase project (tkremoxfkgoiuwghtzwd).

DO $$
DECLARE
  v_cron_secret text;
  v_headers jsonb;
  base_url text := 'https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1';
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
          url := '%s/send-booking-reminders',
          headers := %L::jsonb,
          body := '{}'::jsonb
        );
      $job$,
      base_url,
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
          url := '%s/send-aftercare-emails',
          headers := %L::jsonb,
          body := '{}'::jsonb
        );
      $job$,
      base_url,
      v_headers::text
    )
  );
END
$$;

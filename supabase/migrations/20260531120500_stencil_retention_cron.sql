-- Schedule the 12-hour stencil retention cleanup.
-- Mirrors the existing pg_cron jobs (see 20260529110000_vexmy_cron_urls.sql):
-- calls the purge-expired-stencils edge function with the shared cron secret.

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
    SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-stencils-every-15-min'
  ) THEN
    PERFORM cron.unschedule('purge-expired-stencils-every-15-min');
  END IF;

  PERFORM cron.schedule(
    'purge-expired-stencils-every-15-min',
    '*/15 * * * *',
    format(
      $job$
        SELECT net.http_post(
          url := '%s/purge-expired-stencils',
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

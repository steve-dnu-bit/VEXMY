-- Velbok cron chain: pg_cron -> net.http_post -> Edge Functions (every 15 minutes).
-- Requires vault secret cron_secret = Edge Function secret CRON_SECRET (same value).
-- Re-run anytime: SELECT public.refresh_cron_jobs();

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.refresh_cron_jobs()
RETURNS TABLE(job_name text, schedule text, note text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cron_secret text;
  v_headers jsonb;
  base_url text := 'https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1';
BEGIN
  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_secret'
  LIMIT 1;

  IF v_cron_secret IS NULL OR length(trim(v_cron_secret)) = 0 THEN
    RAISE EXCEPTION 'vault secret cron_secret is missing. Run scripts/setup-cron-chain.ps1 and apply the vault SQL.';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_cron_secret,
    'x-cron-secret', v_cron_secret
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-booking-reminders-every-15-min') THEN
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

  job_name := 'send-booking-reminders-every-15-min';
  schedule := '*/15 * * * *';
  note := base_url || '/send-booking-reminders';
  RETURN NEXT;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-aftercare-emails-every-15-min') THEN
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

  job_name := 'send-aftercare-emails-every-15-min';
  schedule := '*/15 * * * *';
  note := base_url || '/send-aftercare-emails';
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.refresh_cron_jobs() IS
  'Reschedules pg_cron jobs for send-booking-reminders and send-aftercare-emails using vault cron_secret.';

REVOKE ALL ON FUNCTION public.refresh_cron_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_cron_jobs() TO service_role;

-- After vault secret cron_secret is set, run: SELECT * FROM public.refresh_cron_jobs();

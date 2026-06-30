-- Immediate ticket push on new messages + restore email debounce cron (removed with legacy chat).

CREATE OR REPLACE FUNCTION public.schedule_ticket_email_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_recipient_id uuid;
  v_preview text;
  v_cron_secret text;
  v_headers jsonb;
BEGIN
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.sender_id = v_ticket.customer_id THEN
    v_recipient_id := v_ticket.assigned_artist_id;

    IF v_recipient_id IS NULL THEN
      SELECT ur.user_id INTO v_recipient_id
      FROM public.user_roles ur
      JOIN public.organization_members om ON om.user_id = ur.user_id
      WHERE om.organization_id = v_ticket.organization_id
        AND ur.role = 'admin'::public.app_role
      ORDER BY om.joined_at ASC
      LIMIT 1;
    END IF;

    IF v_recipient_id IS NULL THEN
      SELECT om.user_id INTO v_recipient_id
      FROM public.organization_members om
      JOIN public.user_roles ur ON ur.user_id = om.user_id AND ur.role = 'artist'::public.app_role
      WHERE om.organization_id = v_ticket.organization_id
      ORDER BY om.joined_at ASC
      LIMIT 1;
    END IF;
  ELSE
    v_recipient_id := v_ticket.customer_id;
  END IF;

  IF v_recipient_id IS NULL OR v_recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  v_preview := left(coalesce(nullif(trim(NEW.body), ''), 'You received a new inbox message.'), 280);

  UPDATE public.ticket_email_notification_queue
  SET canceled_at = now(), updated_at = now()
  WHERE ticket_id = NEW.ticket_id
    AND recipient_id = NEW.sender_id
    AND sent_at IS NULL
    AND canceled_at IS NULL;

  UPDATE public.ticket_email_notification_queue
  SET canceled_at = now(), updated_at = now()
  WHERE ticket_id = NEW.ticket_id
    AND recipient_id = v_recipient_id
    AND sent_at IS NULL
    AND canceled_at IS NULL;

  INSERT INTO public.ticket_email_notification_queue (
    ticket_id, recipient_id, sender_id, last_message_id, preview_text, notify_after
  )
  VALUES (
    NEW.ticket_id, v_recipient_id, NEW.sender_id, NEW.id, v_preview, now() + interval '2 minutes'
  );

  BEGIN
    SELECT decrypted_secret INTO v_cron_secret
    FROM vault.decrypted_secrets
    WHERE name = 'cron_secret'
    LIMIT 1;

    IF v_cron_secret IS NOT NULL AND length(trim(v_cron_secret)) > 0 THEN
      v_headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_cron_secret,
        'x-cron-secret', v_cron_secret
      );

      PERFORM net.http_post(
        url := 'https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1/ticket-push-notify',
        headers := v_headers,
        body := jsonb_build_object(
          'ticket_id', NEW.ticket_id,
          'recipient_id', v_recipient_id,
          'sender_id', NEW.sender_id,
          'preview_text', v_preview
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ticket push notify trigger skipped: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

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

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-pending-deposits-every-5-min') THEN
    PERFORM cron.unschedule('sync-pending-deposits-every-5-min');
  END IF;

  PERFORM cron.schedule(
    'sync-pending-deposits-every-5-min',
    '*/5 * * * *',
    format(
      $job$
        SELECT net.http_post(
          url := '%s/sync-pending-deposits',
          headers := %L::jsonb,
          body := '{}'::jsonb
        );
      $job$,
      base_url,
      v_headers::text
    )
  );

  job_name := 'sync-pending-deposits-every-5-min';
  schedule := '*/5 * * * *';
  note := base_url || '/sync-pending-deposits';
  RETURN NEXT;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-ticket-notifications-every-min') THEN
    PERFORM cron.unschedule('process-ticket-notifications-every-min');
  END IF;

  PERFORM cron.schedule(
    'process-ticket-notifications-every-min',
    '* * * * *',
    format(
      $job$
        SELECT net.http_post(
          url := '%s/process-chat-email-notifications',
          headers := %L::jsonb,
          body := '{}'::jsonb
        );
      $job$,
      base_url,
      v_headers::text
    )
  );

  job_name := 'process-ticket-notifications-every-min';
  schedule := '* * * * *';
  note := base_url || '/process-chat-email-notifications (ticket email debounce)';
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.refresh_cron_jobs() IS
  'Reschedules pg_cron jobs for reminders, aftercare emails, deposit sync, and ticket inbox emails.';

-- After applying: SELECT * FROM public.refresh_cron_jobs();

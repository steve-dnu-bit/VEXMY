-- Debounced chat email notifications: notify the other party 15 minutes after the last message,
-- unless they read the thread or send a reply first.

CREATE TABLE IF NOT EXISTS public.chat_email_notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  preview_text text NOT NULL DEFAULT '',
  notify_after timestamptz NOT NULL,
  sent_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_email_notification_queue_due_idx
  ON public.chat_email_notification_queue (notify_after)
  WHERE sent_at IS NULL AND canceled_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chat_email_notification_queue_pending_uniq
  ON public.chat_email_notification_queue (thread_id, recipient_id)
  WHERE sent_at IS NULL AND canceled_at IS NULL;

ALTER TABLE public.chat_email_notification_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.schedule_chat_email_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artist_id uuid;
  v_customer_id uuid;
  v_recipient_id uuid;
  v_preview text;
BEGIN
  SELECT artist_id, customer_id INTO v_artist_id, v_customer_id
  FROM public.chat_threads
  WHERE id = NEW.thread_id;

  IF v_artist_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_id = v_artist_id THEN
    v_recipient_id := v_customer_id;
  ELSE
    v_recipient_id := v_artist_id;
  END IF;

  IF v_recipient_id IS NULL OR v_recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  v_preview := left(coalesce(nullif(trim(NEW.body), ''), 'You received a new message.'), 280);

  -- Sender is active: no email needed for messages they may have already seen.
  UPDATE public.chat_email_notification_queue
  SET canceled_at = now(), updated_at = now()
  WHERE thread_id = NEW.thread_id
    AND recipient_id = NEW.sender_id
    AND sent_at IS NULL
    AND canceled_at IS NULL;

  -- Reset the timer for the other person (15 minutes from this message).
  UPDATE public.chat_email_notification_queue
  SET canceled_at = now(), updated_at = now()
  WHERE thread_id = NEW.thread_id
    AND recipient_id = v_recipient_id
    AND sent_at IS NULL
    AND canceled_at IS NULL;

  INSERT INTO public.chat_email_notification_queue (
    thread_id,
    recipient_id,
    sender_id,
    last_message_id,
    preview_text,
    notify_after
  ) VALUES (
    NEW.thread_id,
    v_recipient_id,
    NEW.sender_id,
    NEW.id,
    v_preview,
    now() + interval '15 minutes'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_chat_email_notification ON public.chat_messages;
CREATE TRIGGER trg_schedule_chat_email_notification
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.schedule_chat_email_notification();

CREATE OR REPLACE FUNCTION public.cancel_chat_email_on_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_read_at IS DISTINCT FROM OLD.last_read_at AND NEW.last_read_at IS NOT NULL THEN
    UPDATE public.chat_email_notification_queue q
    SET canceled_at = now(), updated_at = now()
    WHERE q.thread_id = NEW.thread_id
      AND q.recipient_id = NEW.user_id
      AND q.sent_at IS NULL
      AND q.canceled_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.chat_messages m
        WHERE m.id = q.last_message_id
          AND m.created_at <= NEW.last_read_at
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_chat_email_on_read ON public.chat_members;
CREATE TRIGGER trg_cancel_chat_email_on_read
AFTER UPDATE OF last_read_at ON public.chat_members
FOR EACH ROW
EXECUTE FUNCTION public.cancel_chat_email_on_read();

-- Process due notifications every minute (same auth pattern as booking reminders).
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
    SELECT 1 FROM cron.job WHERE jobname = 'process-chat-email-notifications-every-min'
  ) THEN
    PERFORM cron.unschedule('process-chat-email-notifications-every-min');
  END IF;

  PERFORM cron.schedule(
    'process-chat-email-notifications-every-min',
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
END
$$;

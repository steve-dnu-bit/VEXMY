-- Increase chat email debounce from 5 to 15 minutes (for databases that already applied the earlier migration).

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

  UPDATE public.chat_email_notification_queue
  SET canceled_at = now(), updated_at = now()
  WHERE thread_id = NEW.thread_id
    AND recipient_id = NEW.sender_id
    AND sent_at IS NULL
    AND canceled_at IS NULL;

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

-- Extend pending notifications that were scheduled with the old 5-minute window.
UPDATE public.chat_email_notification_queue
SET notify_after = created_at + interval '15 minutes',
    updated_at = now()
WHERE sent_at IS NULL
  AND canceled_at IS NULL
  AND notify_after <= created_at + interval '15 minutes';

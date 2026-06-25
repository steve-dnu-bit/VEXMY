-- Reduce duplicate booking emails: skip no-op updates and tighten update trigger.

CREATE OR REPLACE FUNCTION public.notify_booking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cron_secret text;
  v_headers jsonb;
  v_action text;
  v_booking jsonb;
  v_url text := 'https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1/booking-notifications';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.suppress_booking_notifications THEN
      RETURN OLD;
    END IF;
  ELSIF NEW.suppress_booking_notifications THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Linking portal accounts or deposit sync should not send a second "updated" email.
    IF (
      ROW(
        NEW.artist_id,
        NEW.client_name,
        NEW.client_phone,
        NEW.client_email,
        NEW.tattoo_style,
        NEW.tattoo_size,
        NEW.tattoo_placement,
        NEW.notes,
        NEW.booking_type,
        NEW.service_category,
        NEW.status,
        NEW.starts_at,
        NEW.ends_at,
        NEW.deposit_amount,
        NEW.deposit_paid,
        NEW.vip_client
      ) IS NOT DISTINCT FROM ROW(
        OLD.artist_id,
        OLD.client_name,
        OLD.client_phone,
        OLD.client_email,
        OLD.tattoo_style,
        OLD.tattoo_size,
        OLD.tattoo_placement,
        OLD.notes,
        OLD.booking_type,
        OLD.service_category,
        OLD.status,
        OLD.starts_at,
        OLD.ends_at,
        OLD.deposit_amount,
        OLD.deposit_paid,
        OLD.vip_client
      )
    ) THEN
      RETURN NEW;
    END IF;

    -- Ignore follow-up writes immediately after creation (race with insert notification).
    IF NEW.created_at >= (now() - interval '5 minutes') THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_secret'
  LIMIT 1;

  IF v_cron_secret IS NULL OR length(trim(v_cron_secret)) = 0 THEN
    RAISE WARNING 'booking email trigger skipped: vault secret cron_secret is not set';
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_cron_secret,
    'x-cron-secret', v_cron_secret
  );

  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_booking := jsonb_build_object('id', NEW.id);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'updated';
    v_booking := jsonb_build_object('id', NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_booking := jsonb_build_object(
      'id', OLD.id,
      'artist_id', OLD.artist_id,
      'client_name', OLD.client_name,
      'client_email', OLD.client_email,
      'client_phone', OLD.client_phone,
      'booking_type', OLD.booking_type,
      'service_category', OLD.service_category,
      'status', OLD.status,
      'starts_at', OLD.starts_at,
      'ends_at', OLD.ends_at,
      'notes', OLD.notes,
      'tattoo_style', OLD.tattoo_style,
      'tattoo_size', OLD.tattoo_size,
      'tattoo_placement', OLD.tattoo_placement,
      'deposit_amount', OLD.deposit_amount,
      'deposit_paid', OLD.deposit_paid
    );
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := v_headers,
    body := jsonb_build_object(
      'action', v_action,
      'booking', v_booking,
      'source', 'db_trigger'
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_notify_email_update ON public.bookings;

CREATE TRIGGER bookings_notify_email_update
AFTER UPDATE ON public.bookings
FOR EACH ROW
WHEN (
  OLD.artist_id IS DISTINCT FROM NEW.artist_id
  OR OLD.client_name IS DISTINCT FROM NEW.client_name
  OR OLD.client_phone IS DISTINCT FROM NEW.client_phone
  OR OLD.client_email IS DISTINCT FROM NEW.client_email
  OR OLD.client_user_id IS DISTINCT FROM NEW.client_user_id
  OR OLD.tattoo_style IS DISTINCT FROM NEW.tattoo_style
  OR OLD.tattoo_size IS DISTINCT FROM NEW.tattoo_size
  OR OLD.tattoo_placement IS DISTINCT FROM NEW.tattoo_placement
  OR OLD.notes IS DISTINCT FROM NEW.notes
  OR OLD.booking_type IS DISTINCT FROM NEW.booking_type
  OR OLD.service_category IS DISTINCT FROM NEW.service_category
  OR OLD.status IS DISTINCT FROM NEW.status
  OR OLD.starts_at IS DISTINCT FROM NEW.starts_at
  OR OLD.ends_at IS DISTINCT FROM NEW.ends_at
  OR OLD.deposit_amount IS DISTINCT FROM NEW.deposit_amount
  OR OLD.deposit_paid IS DISTINCT FROM NEW.deposit_paid
  OR OLD.vip_client IS DISTINCT FROM NEW.vip_client
)
EXECUTE FUNCTION public.notify_booking_change();

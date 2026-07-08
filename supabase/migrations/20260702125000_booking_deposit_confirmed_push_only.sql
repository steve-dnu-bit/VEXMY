-- When a customer confirms by paying a deposit, notify the artist in-app only (no booking update emails).

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
  v_update_kind text;
  v_url text := 'https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1/booking-notifications';
BEGIN
  v_update_kind := NULL;

  IF TG_OP = 'DELETE' THEN
    IF OLD.suppress_booking_notifications THEN
      RETURN OLD;
    END IF;
  ELSIF NEW.suppress_booking_notifications THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Customer paid deposit — only deposit_paid changed on an otherwise unchanged booking.
    IF COALESCE(OLD.deposit_paid, false) = false
      AND NEW.deposit_paid IS TRUE
      AND ROW(
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
        NEW.deposit_amount
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
        OLD.deposit_amount
      ) THEN
      v_update_kind := 'deposit_confirmed';
    END IF;

    -- Linking portal accounts or deposit sync should not send a second "updated" email.
    IF v_update_kind IS NULL AND (
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
        NEW.deposit_paid
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
        OLD.deposit_paid
      )
    ) THEN
      RETURN NEW;
    END IF;

    -- Ignore follow-up writes immediately after creation (not deposit confirmation).
    IF v_update_kind IS NULL AND NEW.created_at >= (now() - interval '5 minutes') THEN
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
      'source', 'db_trigger',
      'update_kind', v_update_kind
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

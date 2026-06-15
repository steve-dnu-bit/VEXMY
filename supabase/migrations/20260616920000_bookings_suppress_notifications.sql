-- Bulk imports (clients CSV, schedule import) must not email customers.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS suppress_booking_notifications boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bookings.suppress_booking_notifications IS
  'When true, booking email triggers and notifications are skipped (imports, migrations).';

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

-- Legacy imported placeholder rows (before this column existed).
UPDATE public.bookings
SET suppress_booking_notifications = true
WHERE suppress_booking_notifications = false
  AND (
    notes ILIKE 'Imported from CSV%'
    OR notes ILIKE 'Imported from JSON%'
  );

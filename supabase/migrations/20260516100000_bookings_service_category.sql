-- Consent / aftercare use service modality (tattoo vs piercing), not booking_type (session vs consultation).

ALTER TABLE public.services
  ADD COLUMN service_category text NOT NULL DEFAULT 'tattoo',
  ADD CONSTRAINT services_service_category_check
    CHECK (service_category IN ('tattoo', 'piercing', 'laser', 'consultation'));

ALTER TABLE public.bookings
  ADD COLUMN service_category text NOT NULL DEFAULT 'tattoo',
  ADD CONSTRAINT bookings_service_category_check
    CHECK (service_category IN ('tattoo', 'piercing', 'laser', 'consultation'));

UPDATE public.services SET service_category = 'piercing' WHERE name ILIKE '%piercing%';
UPDATE public.services SET service_category = 'consultation' WHERE booking_type = 'consultation';

UPDATE public.bookings b
SET service_category = 'piercing'
FROM public.services s
WHERE s.service_category = 'piercing'
  AND b.booking_type = s.booking_type
  AND (EXTRACT(EPOCH FROM (b.ends_at - b.starts_at)) / 60)::int = s.duration;

UPDATE public.bookings SET service_category = 'consultation' WHERE booking_type = 'consultation';

-- Replace insert RPC: add p_service_category (optional at call site via default).

DROP FUNCTION IF EXISTS public.staff_insert_booking(
  uuid, text, text, text, uuid, text, text, text, text, text, text, boolean, timestamptz, timestamptz
);

CREATE OR REPLACE FUNCTION public.staff_insert_booking(
  p_artist_id uuid,
  p_client_name text,
  p_client_phone text,
  p_client_email text,
  p_client_user_id uuid,
  p_tattoo_style text,
  p_tattoo_size text,
  p_tattoo_placement text,
  p_notes text,
  p_booking_type text,
  p_status text,
  p_deposit_paid boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_service_category text DEFAULT 'tattoo'
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bookings%ROWTYPE;
  v_cat text;
BEGIN
  IF NOT public._staff_booking_caller_allowed() THEN
    RAISE EXCEPTION 'not allowed to create bookings';
  END IF;

  v_cat := lower(trim(coalesce(p_service_category, '')));
  IF v_cat NOT IN ('tattoo', 'piercing', 'laser', 'consultation') THEN
    v_cat := 'tattoo';
  END IF;

  INSERT INTO public.bookings (
    artist_id,
    client_name,
    client_phone,
    client_email,
    client_user_id,
    tattoo_style,
    tattoo_size,
    tattoo_placement,
    notes,
    booking_type,
    status,
    deposit_paid,
    starts_at,
    ends_at,
    service_category
  )
  VALUES (
    p_artist_id,
    p_client_name,
    NULLIF(trim(COALESCE(p_client_phone, '')), ''),
    NULLIF(trim(COALESCE(p_client_email, '')), ''),
    p_client_user_id,
    NULLIF(trim(COALESCE(p_tattoo_style, '')), ''),
    NULLIF(trim(COALESCE(p_tattoo_size, '')), ''),
    NULLIF(trim(COALESCE(p_tattoo_placement, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    COALESCE(NULLIF(trim(p_booking_type), ''), 'session'),
    COALESCE(NULLIF(trim(p_status), ''), 'confirmed'),
    COALESCE(p_deposit_paid, false),
    p_starts_at,
    p_ends_at,
    v_cat
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_update_booking(p_id uuid, p_patch jsonb)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bookings%ROWTYPE;
  v_cat text;
BEGIN
  IF NOT public._staff_booking_caller_allowed() THEN
    RAISE EXCEPTION 'not allowed to update bookings';
  END IF;

  UPDATE public.bookings b
  SET
    artist_id = CASE WHEN p_patch ? 'artist_id' THEN (p_patch->>'artist_id')::uuid ELSE b.artist_id END,
    client_name = CASE WHEN p_patch ? 'client_name' THEN p_patch->>'client_name' ELSE b.client_name END,
    client_phone = CASE
      WHEN p_patch ? 'client_phone' THEN NULLIF(trim(p_patch->>'client_phone'), '')
      ELSE b.client_phone
    END,
    client_email = CASE
      WHEN p_patch ? 'client_email' THEN NULLIF(lower(trim(p_patch->>'client_email')), '')
      ELSE b.client_email
    END,
    client_user_id = CASE
      WHEN p_patch ? 'client_user_id' THEN (NULLIF(p_patch->>'client_user_id', ''))::uuid
      ELSE b.client_user_id
    END,
    tattoo_style = CASE
      WHEN p_patch ? 'tattoo_style' THEN NULLIF(trim(p_patch->>'tattoo_style'), '')
      ELSE b.tattoo_style
    END,
    tattoo_size = CASE
      WHEN p_patch ? 'tattoo_size' THEN NULLIF(trim(p_patch->>'tattoo_size'), '')
      ELSE b.tattoo_size
    END,
    tattoo_placement = CASE
      WHEN p_patch ? 'tattoo_placement' THEN NULLIF(trim(p_patch->>'tattoo_placement'), '')
      ELSE b.tattoo_placement
    END,
    notes = CASE
      WHEN p_patch ? 'notes' THEN NULLIF(trim(p_patch->>'notes'), '')
      ELSE b.notes
    END,
    booking_type = CASE WHEN p_patch ? 'booking_type' THEN p_patch->>'booking_type' ELSE b.booking_type END,
    status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE b.status END,
    deposit_paid = CASE WHEN p_patch ? 'deposit_paid' THEN (p_patch->>'deposit_paid')::boolean ELSE b.deposit_paid END,
    starts_at = CASE WHEN p_patch ? 'starts_at' THEN (p_patch->>'starts_at')::timestamptz ELSE b.starts_at END,
    ends_at = CASE WHEN p_patch ? 'ends_at' THEN (p_patch->>'ends_at')::timestamptz ELSE b.ends_at END,
    service_category = CASE
      WHEN p_patch ? 'service_category' THEN
        CASE
          WHEN lower(trim(p_patch->>'service_category')) IN ('tattoo', 'piercing', 'laser', 'consultation')
          THEN lower(trim(p_patch->>'service_category'))
          ELSE b.service_category
        END
      ELSE b.service_category
    END
  WHERE b.id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_insert_booking(
  uuid, text, text, text, uuid, text, text, text, text, text, text, boolean, timestamptz, timestamptz, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_insert_booking(
  uuid, text, text, text, uuid, text, text, text, text, text, text, boolean, timestamptz, timestamptz, text
) TO authenticated;

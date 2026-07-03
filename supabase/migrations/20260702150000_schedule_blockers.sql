-- Calendar blockers (holidays / private time) — not client bookings.

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_type_check
  CHECK (booking_type IN (
    'consultation',
    'session',
    'touch-up',
    'piercing-session',
    'laser-session',
    'blocker'
  ));

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_service_category_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_service_category_check
  CHECK (service_category IN (
    'tattoo',
    'piercing',
    'laser',
    'consultation',
    'holiday',
    'private'
  ));

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
  p_service_category text DEFAULT 'tattoo',
  p_deposit_amount numeric DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bookings%ROWTYPE;
  v_cat text;
  v_bt text;
  v_org_id uuid;
  v_default numeric;
  v_deposit numeric;
  v_country text;
BEGIN
  IF NOT public._staff_booking_caller_allowed() THEN
    RAISE EXCEPTION 'not allowed to create bookings';
  END IF;

  v_org_id := COALESCE(
    public.get_user_organization_id(auth.uid()),
    public.resolve_user_organization_id(p_artist_id)
  );

  IF NOT public._staff_booking_org_allowed(v_org_id, p_artist_id) THEN
    RAISE EXCEPTION 'artist not in your organization';
  END IF;

  v_bt := lower(trim(coalesce(p_booking_type, '')));

  IF v_bt = 'blocker' THEN
    v_cat := lower(trim(coalesce(p_service_category, '')));
    IF v_cat NOT IN ('holiday', 'private') THEN
      v_cat := 'private';
    END IF;

    INSERT INTO public.bookings (
      artist_id,
      organization_id,
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
      deposit_amount,
      starts_at,
      ends_at,
      service_category,
      suppress_booking_notifications
    )
    VALUES (
      p_artist_id,
      v_org_id,
      trim(p_client_name),
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULLIF(trim(COALESCE(p_notes, '')), ''),
      'blocker',
      COALESCE(NULLIF(trim(p_status), ''), 'confirmed'),
      false,
      0,
      p_starts_at,
      p_ends_at,
      v_cat,
      true
    )
    RETURNING * INTO v_row;

    RETURN v_row;
  END IF;

  v_cat := lower(trim(coalesce(p_service_category, '')));
  IF v_cat NOT IN ('tattoo', 'piercing', 'laser', 'consultation') THEN
    v_cat := 'tattoo';
  END IF;

  SELECT ss.default_deposit_amount, ss.country
  INTO v_default, v_country
  FROM public.shop_settings ss
  WHERE ss.organization_id = v_org_id
  LIMIT 1;

  v_country := coalesce(v_country, 'UK');
  v_deposit := public._valid_deposit_amount(COALESCE(p_deposit_amount, v_default, 50), v_country);

  INSERT INTO public.bookings (
    artist_id,
    organization_id,
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
    deposit_amount,
    starts_at,
    ends_at,
    service_category
  )
  VALUES (
    p_artist_id,
    v_org_id,
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
    CASE
      WHEN v_deposit = 0 THEN false
      ELSE COALESCE(p_deposit_paid, false)
    END,
    v_deposit,
    p_starts_at,
    p_ends_at,
    v_cat
  )
  RETURNING * INTO v_row;

  IF p_client_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, p_client_user_id, 'member'::public.org_member_role)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

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
  v_existing public.bookings%ROWTYPE;
  v_artist_id uuid;
  v_org_id uuid;
  v_client_user_id uuid;
  v_country text;
  v_deposit numeric;
  v_result_bt text;
  v_result_cat text;
BEGIN
  IF NOT public._staff_booking_caller_allowed() THEN
    RAISE EXCEPTION 'not allowed to update bookings';
  END IF;

  SELECT * INTO v_existing FROM public.bookings WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  IF NOT public._staff_booking_org_allowed(v_existing.organization_id, v_existing.artist_id) THEN
    RAISE EXCEPTION 'booking not in your organization';
  END IF;

  v_artist_id := CASE
    WHEN p_patch ? 'artist_id' THEN (p_patch->>'artist_id')::uuid
    ELSE v_existing.artist_id
  END;

  IF NOT public._staff_booking_org_allowed(v_existing.organization_id, v_artist_id) THEN
    RAISE EXCEPTION 'artist not in your organization';
  END IF;

  v_org_id := COALESCE(v_existing.organization_id, public.resolve_user_organization_id(v_artist_id));

  v_result_bt := CASE
    WHEN p_patch ? 'booking_type' THEN lower(trim(p_patch->>'booking_type'))
    ELSE lower(v_existing.booking_type)
  END;

  v_result_cat := CASE
    WHEN p_patch ? 'service_category' THEN lower(trim(p_patch->>'service_category'))
    ELSE lower(v_existing.service_category)
  END;

  IF v_result_bt = 'blocker' THEN
    IF v_result_cat NOT IN ('holiday', 'private') THEN
      v_result_cat := 'private';
    END IF;
    v_deposit := 0;
  ELSE
    SELECT ss.country INTO v_country
    FROM public.shop_settings ss
    WHERE ss.organization_id = v_org_id
    LIMIT 1;

    v_country := coalesce(v_country, 'UK');

    IF p_patch ? 'deposit_amount' THEN
      v_deposit := public._valid_deposit_amount((p_patch->>'deposit_amount')::numeric, v_country);
    ELSE
      v_deposit := v_existing.deposit_amount;
    END IF;
  END IF;

  UPDATE public.bookings b
  SET
    artist_id = v_artist_id,
    organization_id = v_org_id,
    client_name = CASE WHEN p_patch ? 'client_name' THEN p_patch->>'client_name' ELSE b.client_name END,
    client_phone = CASE
      WHEN v_result_bt = 'blocker' THEN NULL
      WHEN p_patch ? 'client_phone' THEN NULLIF(trim(p_patch->>'client_phone'), '')
      ELSE b.client_phone
    END,
    client_email = CASE
      WHEN v_result_bt = 'blocker' THEN NULL
      WHEN p_patch ? 'client_email' THEN NULLIF(lower(trim(p_patch->>'client_email')), '')
      ELSE b.client_email
    END,
    client_user_id = CASE
      WHEN v_result_bt = 'blocker' THEN NULL
      WHEN p_patch ? 'client_user_id' THEN (NULLIF(p_patch->>'client_user_id', ''))::uuid
      ELSE b.client_user_id
    END,
    tattoo_style = CASE
      WHEN v_result_bt = 'blocker' THEN NULL
      WHEN p_patch ? 'tattoo_style' THEN NULLIF(trim(p_patch->>'tattoo_style'), '')
      ELSE b.tattoo_style
    END,
    tattoo_size = CASE
      WHEN v_result_bt = 'blocker' THEN NULL
      WHEN p_patch ? 'tattoo_size' THEN NULLIF(trim(p_patch->>'tattoo_size'), '')
      ELSE b.tattoo_size
    END,
    tattoo_placement = CASE
      WHEN v_result_bt = 'blocker' THEN NULL
      WHEN p_patch ? 'tattoo_placement' THEN NULLIF(trim(p_patch->>'tattoo_placement'), '')
      ELSE b.tattoo_placement
    END,
    notes = CASE
      WHEN p_patch ? 'notes' THEN NULLIF(trim(p_patch->>'notes'), '')
      ELSE b.notes
    END,
    booking_type = CASE WHEN p_patch ? 'booking_type' THEN p_patch->>'booking_type' ELSE b.booking_type END,
    status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE b.status END,
    deposit_paid = CASE
      WHEN v_result_bt = 'blocker' THEN false
      WHEN p_patch ? 'deposit_amount' AND v_deposit = 0 THEN false
      WHEN p_patch ? 'deposit_paid' THEN (p_patch->>'deposit_paid')::boolean
      ELSE b.deposit_paid
    END,
    deposit_amount = CASE
      WHEN v_result_bt = 'blocker' THEN 0
      WHEN p_patch ? 'deposit_amount' THEN v_deposit
      ELSE b.deposit_amount
    END,
    starts_at = CASE WHEN p_patch ? 'starts_at' THEN (p_patch->>'starts_at')::timestamptz ELSE b.starts_at END,
    ends_at = CASE WHEN p_patch ? 'ends_at' THEN (p_patch->>'ends_at')::timestamptz ELSE b.ends_at END,
    service_category = CASE
      WHEN v_result_bt = 'blocker' THEN v_result_cat
      WHEN p_patch ? 'service_category' THEN
        CASE
          WHEN lower(trim(p_patch->>'service_category')) IN ('tattoo', 'piercing', 'laser', 'consultation')
          THEN lower(trim(p_patch->>'service_category'))
          ELSE b.service_category
        END
      ELSE b.service_category
    END,
    suppress_booking_notifications = CASE
      WHEN v_result_bt = 'blocker' THEN true
      ELSE b.suppress_booking_notifications
    END
  WHERE b.id = p_id
  RETURNING * INTO v_row;

  v_client_user_id := v_row.client_user_id;
  IF v_client_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, v_client_user_id, 'member'::public.org_member_role)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

  RETURN v_row;
END;
$$;

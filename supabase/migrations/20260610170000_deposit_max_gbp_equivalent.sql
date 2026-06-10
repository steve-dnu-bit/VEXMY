-- Deposit cap: £200 GBP equivalent per shop currency (not a flat 200 in every currency).

CREATE OR REPLACE FUNCTION public._currency_for_shop_country(p_country text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(trim(coalesce(p_country, 'UK')))
    WHEN 'UK' THEN 'gbp'
    WHEN 'GB' THEN 'gbp'
    WHEN 'UNITED KINGDOM' THEN 'gbp'
    WHEN 'US' THEN 'usd'
    WHEN 'USA' THEN 'usd'
    WHEN 'UNITED STATES' THEN 'usd'
    WHEN 'CA' THEN 'cad'
    WHEN 'CANADA' THEN 'cad'
    WHEN 'AU' THEN 'aud'
    WHEN 'AUSTRALIA' THEN 'aud'
    WHEN 'DE' THEN 'eur'
    WHEN 'GERMANY' THEN 'eur'
    WHEN 'FR' THEN 'eur'
    WHEN 'FRANCE' THEN 'eur'
    WHEN 'IT' THEN 'eur'
    WHEN 'ITALY' THEN 'eur'
    WHEN 'ES' THEN 'eur'
    WHEN 'SPAIN' THEN 'eur'
    WHEN 'NL' THEN 'eur'
    WHEN 'NETHERLANDS' THEN 'eur'
    WHEN 'RO' THEN 'ron'
    WHEN 'ROMANIA' THEN 'ron'
    WHEN 'SE' THEN 'sek'
    WHEN 'SWEDEN' THEN 'sek'
    WHEN 'NO' THEN 'nok'
    WHEN 'NORWAY' THEN 'nok'
    WHEN 'BG' THEN 'bgn'
    WHEN 'BULGARIA' THEN 'bgn'
    ELSE 'gbp'
  END;
$$;

CREATE OR REPLACE FUNCTION public._max_deposit_amount_for_currency(p_currency text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round((200 * CASE lower(trim(coalesce(p_currency, 'gbp')))
    WHEN 'gbp' THEN 1.0
    WHEN 'usd' THEN 1.275
    WHEN 'eur' THEN 1.175
    WHEN 'cad' THEN 1.725
    WHEN 'aud' THEN 1.95
    WHEN 'ron' THEN 5.85
    WHEN 'sek' THEN 13.5
    WHEN 'nok' THEN 13.8
    WHEN 'bgn' THEN 2.325
    ELSE 1.0
  END)::numeric, 2);
$$;

CREATE OR REPLACE FUNCTION public._valid_deposit_amount(p_amount numeric, p_country text DEFAULT 'UK')
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v numeric;
  v_currency text;
  v_min numeric;
  v_max numeric;
BEGIN
  v_currency := public._currency_for_shop_country(p_country);
  v := round(coalesce(p_amount, 50)::numeric, 2);

  v_min := CASE v_currency
    WHEN 'gbp' THEN 0.30
    WHEN 'usd' THEN 0.50
    WHEN 'cad' THEN 0.50
    WHEN 'aud' THEN 0.50
    WHEN 'eur' THEN 0.50
    WHEN 'ron' THEN 2.00
    WHEN 'sek' THEN 3.00
    WHEN 'nok' THEN 3.00
    WHEN 'bgn' THEN 1.00
    ELSE 0.50
  END;

  v_max := public._max_deposit_amount_for_currency(v_currency);

  IF v < v_min THEN
    RAISE EXCEPTION 'deposit amount must be at least %', v_min;
  END IF;
  IF v > v_max THEN
    RAISE EXCEPTION 'deposit amount cannot exceed % (% GBP equivalent)', v_max, 200;
  END IF;
  RETURN v;
END;
$$;

COMMENT ON COLUMN public.shop_settings.default_deposit_amount IS
  'Default deposit for new bookings. Max is £200 GBP equivalent in shop currency.';

ALTER TABLE public.shop_settings
  DROP CONSTRAINT IF EXISTS shop_settings_default_deposit_amount_range;

ALTER TABLE public.shop_settings
  ADD CONSTRAINT shop_settings_default_deposit_amount_min
  CHECK (default_deposit_amount >= 0.30);

CREATE OR REPLACE FUNCTION public.trg_shop_settings_validate_default_deposit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public._valid_deposit_amount(NEW.default_deposit_amount, NEW.country);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_settings_validate_default_deposit ON public.shop_settings;
CREATE TRIGGER shop_settings_validate_default_deposit
  BEFORE INSERT OR UPDATE OF default_deposit_amount, country ON public.shop_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_shop_settings_validate_default_deposit();

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
    COALESCE(p_deposit_paid, false),
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
  v_cat text;
  v_artist_id uuid;
  v_org_id uuid;
  v_client_user_id uuid;
  v_country text;
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

  SELECT ss.country INTO v_country
  FROM public.shop_settings ss
  WHERE ss.organization_id = v_org_id
  LIMIT 1;

  v_country := coalesce(v_country, 'UK');

  UPDATE public.bookings b
  SET
    artist_id = v_artist_id,
    organization_id = v_org_id,
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
    deposit_amount = CASE
      WHEN p_patch ? 'deposit_amount' THEN public._valid_deposit_amount((p_patch->>'deposit_amount')::numeric, v_country)
      ELSE b.deposit_amount
    END,
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

  v_client_user_id := v_row.client_user_id;
  IF v_client_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, v_client_user_id, 'member'::public.org_member_role)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

  RETURN v_row;
END;
$$;

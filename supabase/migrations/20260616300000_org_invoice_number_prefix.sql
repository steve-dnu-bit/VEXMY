-- Derive per-organization invoice number prefix from org slug (e.g. my-tattoo-studio -> MTS).

CREATE OR REPLACE FUNCTION public.sanitize_invoice_number_prefix(_prefix text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(regexp_replace(upper(trim(coalesce(_prefix, ''))), '[^A-Z0-9]', '', 'g')) < 2
      THEN 'INV'
    ELSE substr(regexp_replace(upper(trim(coalesce(_prefix, ''))), '[^A-Z0-9]', '', 'g'), 1, 8)
  END;
$$;

CREATE OR REPLACE FUNCTION public.derive_invoice_number_prefix(_slug text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean text;
  v_parts text[];
  v_prefix text;
  p text;
BEGIN
  v_clean := lower(trim(coalesce(_slug, '')));
  IF v_clean = '' THEN
    RETURN 'INV';
  END IF;

  v_parts := string_to_array(v_clean, '-');
  v_parts := array_remove(v_parts, '');

  IF coalesce(array_length(v_parts, 1), 0) < 1 THEN
    RETURN public.sanitize_invoice_number_prefix(v_clean);
  END IF;

  IF array_length(v_parts, 1) = 1 THEN
    RETURN public.sanitize_invoice_number_prefix(v_parts[1]);
  END IF;

  IF array_length(v_parts, 1) = 2 THEN
    v_prefix :=
      substr(regexp_replace(v_parts[1], '[^a-z0-9]', '', 'g'), 1, 2) ||
      substr(regexp_replace(v_parts[2], '[^a-z0-9]', '', 'g'), 1, 2);
    RETURN public.sanitize_invoice_number_prefix(v_prefix);
  END IF;

  v_prefix := '';
  FOREACH p IN ARRAY v_parts LOOP
    IF p <> '' THEN
      v_prefix := v_prefix || upper(substr(p, 1, 1));
    END IF;
    EXIT WHEN length(v_prefix) >= 4;
  END LOOP;

  RETURN public.sanitize_invoice_number_prefix(v_prefix);
END;
$$;

-- Backfill studios still on the generic INV prefix.
UPDATE public.organization_billing_profiles obp
SET invoice_number_prefix = public.derive_invoice_number_prefix(o.slug),
    updated_at = now()
FROM public.organizations o
WHERE o.id = obp.organization_id
  AND obp.invoice_number_prefix = 'INV';

CREATE OR REPLACE FUNCTION public.upsert_billing_profile_from_shop(_shop_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop public.shop_settings%ROWTYPE;
  v_bc public.billing_countries%ROWTYPE;
  v_rate numeric(5, 2);
  v_org_slug text;
  v_prefix text;
BEGIN
  SELECT * INTO v_shop FROM public.shop_settings WHERE id = _shop_id;
  IF NOT FOUND OR v_shop.organization_id IS NULL THEN
    RETURN;
  END IF;

  SELECT slug INTO v_org_slug
  FROM public.organizations
  WHERE id = v_shop.organization_id;

  v_prefix := public.derive_invoice_number_prefix(v_org_slug);

  SELECT * INTO v_bc FROM public.billing_countries WHERE code = v_shop.country_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid shop country_code: %', v_shop.country_code;
  END IF;

  v_rate := CASE
    WHEN v_bc.default_standard_rate IS NOT NULL THEN v_bc.default_standard_rate
    ELSE 0
  END;

  INSERT INTO public.organization_billing_profiles (
    organization_id,
    country_code,
    currency,
    default_tax_rate,
    tax_label,
    prices_include_tax,
    invoice_legal_name,
    invoice_trading_name,
    invoice_address_line1,
    invoice_address_line2,
    invoice_city,
    invoice_postcode,
    invoice_support_email,
    invoice_number_prefix
  )
  VALUES (
    v_shop.organization_id,
    v_shop.country_code,
    v_bc.currency,
    v_rate,
    v_bc.default_tax_label,
    v_bc.prices_include_tax_default,
    coalesce(nullif(trim(v_shop.legal_name), ''), v_shop.shop_name, 'Studio'),
    coalesce(nullif(trim(v_shop.trading_name), ''), v_shop.shop_name),
    v_shop.address_line1,
    v_shop.address_line2,
    v_shop.city,
    v_shop.postcode,
    v_shop.support_email,
    v_prefix
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    country_code = EXCLUDED.country_code,
    currency = EXCLUDED.currency,
    tax_label = EXCLUDED.tax_label,
    prices_include_tax = EXCLUDED.prices_include_tax,
    invoice_legal_name = COALESCE(NULLIF(EXCLUDED.invoice_legal_name, ''), organization_billing_profiles.invoice_legal_name),
    invoice_trading_name = COALESCE(EXCLUDED.invoice_trading_name, organization_billing_profiles.invoice_trading_name),
    invoice_address_line1 = COALESCE(EXCLUDED.invoice_address_line1, organization_billing_profiles.invoice_address_line1),
    invoice_address_line2 = COALESCE(EXCLUDED.invoice_address_line2, organization_billing_profiles.invoice_address_line2),
    invoice_city = COALESCE(EXCLUDED.invoice_city, organization_billing_profiles.invoice_city),
    invoice_postcode = COALESCE(EXCLUDED.invoice_postcode, organization_billing_profiles.invoice_postcode),
    invoice_support_email = COALESCE(EXCLUDED.invoice_support_email, organization_billing_profiles.invoice_support_email),
    invoice_number_prefix = CASE
      WHEN organization_billing_profiles.invoice_number_prefix = 'INV'
        THEN EXCLUDED.invoice_number_prefix
      ELSE organization_billing_profiles.invoice_number_prefix
    END,
    updated_at = now();

  UPDATE public.organizations o
  SET
    billing_country_code = v_shop.country_code,
    billing_currency = v_bc.currency,
    billing_address_line1 = v_shop.address_line1,
    billing_city = v_shop.city,
    billing_postcode = v_shop.postcode,
    updated_at = now()
  WHERE o.id = v_shop.organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_invoice_number(_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_seq integer;
  v_date text;
  v_slug text;
BEGIN
  IF _org_id IS NULL THEN
    _org_id := public.get_user_organization_id();
  END IF;

  IF _org_id IS NULL THEN
    RETURN 'INV-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
  END IF;

  SELECT invoice_number_prefix, next_invoice_sequence
  INTO v_prefix, v_seq
  FROM public.organization_billing_profiles
  WHERE organization_id = _org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT slug INTO v_slug FROM public.organizations WHERE id = _org_id;
    v_prefix := public.derive_invoice_number_prefix(v_slug);
    RETURN public.sanitize_invoice_number_prefix(v_prefix) || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
  END IF;

  v_date := to_char(now(), 'YYMMDD');
  v_prefix := public.sanitize_invoice_number_prefix(v_prefix);

  UPDATE public.organization_billing_profiles
  SET next_invoice_sequence = next_invoice_sequence + 1,
      updated_at = now()
  WHERE organization_id = _org_id;

  RETURN v_prefix || '-' || v_date || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_org_billing_context(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.organization_billing_profiles%ROWTYPE;
  v_bc public.billing_countries%ROWTYPE;
  v_shop public.shop_settings%ROWTYPE;
  v_org_slug text;
  v_prefix text;
BEGIN
  IF _org_id IS NULL THEN
    SELECT * INTO v_shop
    FROM public.shop_settings
    ORDER BY created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'organization_id', null,
        'country_code', 'UK',
        'currency', 'gbp',
        'stripe_country', 'GB',
        'tax_label', 'VAT',
        'default_tax_rate', 0,
        'prices_include_tax', false,
        'tax_exempt', false,
        'tax_registration_number', null,
        'invoice_number_prefix', 'INV',
        'organization_slug', null,
        'default_payment_method', 'card',
        'default_payment_term_days', 7
      );
    END IF;

    _org_id := v_shop.organization_id;
  END IF;

  SELECT slug INTO v_org_slug FROM public.organizations WHERE id = _org_id;

  SELECT * INTO v_profile
  FROM public.organization_billing_profiles
  WHERE organization_id = _org_id;

  IF NOT FOUND THEN
    SELECT * INTO v_shop FROM public.shop_settings WHERE organization_id = _org_id LIMIT 1;
    IF FOUND THEN
      PERFORM public.upsert_billing_profile_from_shop(v_shop.id);
      SELECT * INTO v_profile FROM public.organization_billing_profiles WHERE organization_id = _org_id;
    END IF;
  END IF;

  IF NOT FOUND THEN
    v_prefix := public.derive_invoice_number_prefix(v_org_slug);
    RETURN jsonb_build_object(
      'organization_id', _org_id,
      'country_code', 'UK',
      'currency', 'gbp',
      'stripe_country', 'GB',
      'tax_label', 'VAT',
      'default_tax_rate', 0,
      'prices_include_tax', false,
      'tax_exempt', false,
      'tax_registration_number', null,
      'invoice_number_prefix', v_prefix,
      'organization_slug', v_org_slug,
      'default_payment_method', 'card',
      'default_payment_term_days', 7
    );
  END IF;

  SELECT * INTO v_bc FROM public.billing_countries WHERE code = v_profile.country_code;

  RETURN jsonb_build_object(
    'organization_id', v_profile.organization_id,
    'country_code', v_profile.country_code,
    'currency', v_profile.currency,
    'stripe_country', coalesce(v_bc.stripe_country, 'GB'),
    'tax_label', v_profile.tax_label,
    'default_tax_rate', CASE WHEN v_profile.tax_exempt THEN 0 ELSE v_profile.default_tax_rate END,
    'prices_include_tax', v_profile.prices_include_tax,
    'tax_exempt', v_profile.tax_exempt,
    'tax_registration_number', v_profile.tax_registration_number,
    'company_registration_number', v_profile.company_registration_number,
    'invoice_legal_name', v_profile.invoice_legal_name,
    'invoice_trading_name', v_profile.invoice_trading_name,
    'invoice_address_line1', v_profile.invoice_address_line1,
    'invoice_address_line2', v_profile.invoice_address_line2,
    'invoice_city', v_profile.invoice_city,
    'invoice_postcode', v_profile.invoice_postcode,
    'invoice_support_email', v_profile.invoice_support_email,
    'invoice_number_prefix', v_profile.invoice_number_prefix,
    'organization_slug', v_org_slug,
    'default_payment_method', v_profile.default_payment_method,
    'default_payment_term_days', v_profile.default_payment_term_days
  );
END;
$$;

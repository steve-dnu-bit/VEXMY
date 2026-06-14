-- Organization billing segregated by shop country: reference countries, billing profiles,
-- invoice snapshots, platform billing address, and multi-currency plan prices.

-- ---------------------------------------------------------------------------
-- Reference: supported billing countries (aligned with app SHOP_COUNTRIES)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_countries (
  code text PRIMARY KEY,
  stripe_country char(2) NOT NULL UNIQUE,
  currency char(3) NOT NULL,
  label text NOT NULL,
  tax_system text NOT NULL CHECK (tax_system IN ('vat', 'gst', 'sales_tax', 'mva')),
  default_tax_label text NOT NULL,
  default_standard_rate numeric(5, 2),
  prices_include_tax_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true
);

INSERT INTO public.billing_countries
  (code, stripe_country, currency, label, tax_system, default_tax_label, default_standard_rate, prices_include_tax_default)
VALUES
  ('UK', 'GB', 'gbp', 'United Kingdom', 'vat', 'VAT', 20.00, false),
  ('US', 'US', 'usd', 'United States', 'sales_tax', 'Sales tax', NULL, false),
  ('CA', 'CA', 'cad', 'Canada', 'gst', 'GST', NULL, false),
  ('AU', 'AU', 'aud', 'Australia', 'gst', 'GST', 10.00, false),
  ('DE', 'DE', 'eur', 'Germany', 'vat', 'VAT', 19.00, false),
  ('FR', 'FR', 'eur', 'France', 'vat', 'VAT', 20.00, false),
  ('RO', 'RO', 'ron', 'Romania', 'vat', 'VAT', 19.00, false),
  ('IT', 'IT', 'eur', 'Italy', 'vat', 'VAT', 22.00, false),
  ('ES', 'ES', 'eur', 'Spain', 'vat', 'VAT', 21.00, false),
  ('SE', 'SE', 'sek', 'Sweden', 'vat', 'Moms', 25.00, false),
  ('NO', 'NO', 'nok', 'Norway', 'mva', 'MVA', 25.00, false),
  ('NL', 'NL', 'eur', 'Netherlands', 'vat', 'VAT', 21.00, false),
  ('BG', 'BG', 'bgn', 'Bulgaria', 'vat', 'VAT', 20.00, false)
ON CONFLICT (code) DO UPDATE SET
  stripe_country = EXCLUDED.stripe_country,
  currency = EXCLUDED.currency,
  label = EXCLUDED.label,
  tax_system = EXCLUDED.tax_system,
  default_tax_label = EXCLUDED.default_tax_label,
  default_standard_rate = EXCLUDED.default_standard_rate,
  prices_include_tax_default = EXCLUDED.prices_include_tax_default;

ALTER TABLE public.billing_countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read billing countries" ON public.billing_countries;
CREATE POLICY "Anyone can read billing countries"
  ON public.billing_countries FOR SELECT
  USING (is_active = true);

GRANT SELECT ON public.billing_countries TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- shop_settings: controlled country code
-- ---------------------------------------------------------------------------

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS country_code text REFERENCES public.billing_countries(code);

UPDATE public.shop_settings ss
SET country_code = CASE
  WHEN upper(trim(coalesce(ss.country, ''))) IN ('GB', 'UK', 'UNITED KINGDOM') THEN 'UK'
  WHEN upper(trim(ss.country)) IN ('US', 'USA', 'UNITED STATES') THEN 'US'
  WHEN upper(trim(ss.country)) IN ('CA', 'CANADA') THEN 'CA'
  WHEN upper(trim(ss.country)) IN ('AU', 'AUSTRALIA') THEN 'AU'
  WHEN upper(trim(ss.country)) IN ('DE', 'GERMANY', 'DEUTSCHLAND') THEN 'DE'
  WHEN upper(trim(ss.country)) IN ('FR', 'FRANCE') THEN 'FR'
  WHEN upper(trim(ss.country)) IN ('RO', 'ROMANIA', 'ROMÂNIA') THEN 'RO'
  WHEN upper(trim(ss.country)) IN ('IT', 'ITALY', 'ITALIA') THEN 'IT'
  WHEN upper(trim(ss.country)) IN ('ES', 'SPAIN', 'ESPAÑA') THEN 'ES'
  WHEN upper(trim(ss.country)) IN ('SE', 'SWEDEN', 'SVERIGE') THEN 'SE'
  WHEN upper(trim(ss.country)) IN ('NO', 'NORWAY', 'NORGE') THEN 'NO'
  WHEN upper(trim(ss.country)) IN ('NL', 'NETHERLANDS', 'THE NETHERLANDS') THEN 'NL'
  WHEN upper(trim(ss.country)) IN ('BG', 'BULGARIA') THEN 'BG'
  WHEN EXISTS (SELECT 1 FROM public.billing_countries bc WHERE bc.code = upper(trim(ss.country))) THEN upper(trim(ss.country))
  ELSE 'UK'
END
WHERE ss.country_code IS NULL;

ALTER TABLE public.shop_settings
  ALTER COLUMN country_code SET DEFAULT 'UK';

UPDATE public.shop_settings SET country_code = 'UK' WHERE country_code IS NULL;

ALTER TABLE public.shop_settings
  ALTER COLUMN country_code SET NOT NULL;

-- Keep legacy country text in sync for older code paths
CREATE OR REPLACE FUNCTION public.trg_shop_settings_sync_country_text()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.country_code IS NOT NULL THEN
    NEW.country := NEW.country_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_settings_sync_country_text ON public.shop_settings;
CREATE TRIGGER shop_settings_sync_country_text
  BEFORE INSERT OR UPDATE OF country_code ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.trg_shop_settings_sync_country_text();

UPDATE public.shop_settings SET country = country_code WHERE country IS DISTINCT FROM country_code;

-- ---------------------------------------------------------------------------
-- Organization billing profile (1:1 with org)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_billing_profiles (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  country_code text NOT NULL REFERENCES public.billing_countries(code),
  currency char(3) NOT NULL,
  default_tax_rate numeric(5, 2) NOT NULL DEFAULT 0,
  tax_label text NOT NULL DEFAULT 'VAT',
  tax_registration_number text,
  company_registration_number text,
  prices_include_tax boolean NOT NULL DEFAULT false,
  tax_exempt boolean NOT NULL DEFAULT false,
  invoice_legal_name text NOT NULL,
  invoice_trading_name text,
  invoice_address_line1 text,
  invoice_address_line2 text,
  invoice_city text,
  invoice_postcode text,
  invoice_support_email text,
  invoice_number_prefix text NOT NULL DEFAULT 'INV',
  next_invoice_sequence integer NOT NULL DEFAULT 1 CHECK (next_invoice_sequence >= 1),
  default_payment_method text NOT NULL DEFAULT 'card'
    CHECK (default_payment_method IN ('card', 'bank_transfer', 'cash')),
  default_payment_term_days integer NOT NULL DEFAULT 7 CHECK (default_payment_term_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.trg_billing_profile_validate_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected char(3);
BEGIN
  SELECT bc.currency INTO expected
  FROM public.billing_countries bc
  WHERE bc.code = NEW.country_code;

  IF expected IS NULL THEN
    RAISE EXCEPTION 'Unknown billing country code: %', NEW.country_code;
  END IF;

  IF NEW.currency IS DISTINCT FROM expected THEN
    NEW.currency := expected;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_profile_validate_currency ON public.organization_billing_profiles;
CREATE TRIGGER billing_profile_validate_currency
  BEFORE INSERT OR UPDATE OF country_code, currency ON public.organization_billing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_billing_profile_validate_currency();

CREATE OR REPLACE FUNCTION public.trg_billing_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_profile_updated_at ON public.organization_billing_profiles;
CREATE TRIGGER billing_profile_updated_at
  BEFORE UPDATE ON public.organization_billing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_billing_profile_updated_at();

-- ---------------------------------------------------------------------------
-- Organizations: platform (Velbok) billing address
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_country_code text REFERENCES public.billing_countries(code),
  ADD COLUMN IF NOT EXISTS billing_currency char(3),
  ADD COLUMN IF NOT EXISTS billing_address_line1 text,
  ADD COLUMN IF NOT EXISTS billing_city text,
  ADD COLUMN IF NOT EXISTS billing_postcode text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS stripe_tax_customer_id text;

-- ---------------------------------------------------------------------------
-- Invoices: org scope + snapshot fields
-- ---------------------------------------------------------------------------

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'gbp',
  ADD COLUMN IF NOT EXISTS tax_label text NOT NULL DEFAULT 'VAT',
  ADD COLUMN IF NOT EXISTS prices_include_tax boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS issuer_legal_name text,
  ADD COLUMN IF NOT EXISTS issuer_tax_number text,
  ADD COLUMN IF NOT EXISTS issuer_address jsonb;

CREATE INDEX IF NOT EXISTS idx_invoices_organization_created
  ON public.invoices (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

-- Backfill invoice org + currency from shop_settings
UPDATE public.invoices inv
SET
  organization_id = ss.organization_id,
  currency = bc.currency,
  tax_label = obp.tax_label,
  prices_include_tax = obp.prices_include_tax,
  issuer_legal_name = obp.invoice_legal_name,
  issuer_tax_number = obp.tax_registration_number,
  issuer_address = jsonb_build_object(
    'line1', obp.invoice_address_line1,
    'line2', obp.invoice_address_line2,
    'city', obp.invoice_city,
    'postcode', obp.invoice_postcode,
    'country_code', obp.country_code
  )
FROM public.shop_settings ss
JOIN public.billing_countries bc ON bc.code = ss.country_code
LEFT JOIN public.organization_billing_profiles obp ON obp.organization_id = ss.organization_id
WHERE inv.organization_id IS NULL
  AND ss.organization_id IS NOT NULL
  AND ss.id = (
    SELECT s2.id FROM public.shop_settings s2
    WHERE s2.organization_id = ss.organization_id
    ORDER BY s2.created_at ASC LIMIT 1
  );

UPDATE public.invoices
SET currency = 'gbp', tax_label = 'VAT'
WHERE currency IS NULL OR tax_label IS NULL;

-- ---------------------------------------------------------------------------
-- Platform plan prices by currency
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_plan_prices (
  plan_id text NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  currency char(3) NOT NULL,
  amount_monthly numeric(10, 2) NOT NULL,
  stripe_price_id text,
  PRIMARY KEY (plan_id, currency)
);

INSERT INTO public.subscription_plan_prices (plan_id, currency, amount_monthly, stripe_price_id)
VALUES
  ('starter', 'gbp', 14.95, NULL),
  ('studio', 'gbp', 19.95, NULL),
  ('enterprise', 'gbp', 49.95, NULL)
ON CONFLICT (plan_id, currency) DO UPDATE SET
  amount_monthly = EXCLUDED.amount_monthly;

ALTER TABLE public.subscription_plan_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read subscription plan prices" ON public.subscription_plan_prices;
CREATE POLICY "Anyone can read subscription plan prices"
  ON public.subscription_plan_prices FOR SELECT
  USING (true);

GRANT SELECT ON public.subscription_plan_prices TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Upsert billing profile from shop_settings
-- ---------------------------------------------------------------------------

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
BEGIN
  SELECT * INTO v_shop FROM public.shop_settings WHERE id = _shop_id;
  IF NOT FOUND OR v_shop.organization_id IS NULL THEN
    RETURN;
  END IF;

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
    invoice_support_email
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
    v_shop.support_email
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

CREATE OR REPLACE FUNCTION public.trg_shop_settings_sync_billing_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.upsert_billing_profile_from_shop(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_settings_sync_billing_profile ON public.shop_settings;
CREATE TRIGGER shop_settings_sync_billing_profile
  AFTER INSERT OR UPDATE OF
    organization_id, country_code, legal_name, trading_name,
    address_line1, address_line2, city, postcode, support_email, shop_name
  ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.trg_shop_settings_sync_billing_profile();

-- Backfill billing profiles for existing orgs
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.shop_settings WHERE organization_id IS NOT NULL LOOP
    PERFORM public.upsert_billing_profile_from_shop(r.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RPC: org billing context
-- ---------------------------------------------------------------------------

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
        'default_payment_method', 'card',
        'default_payment_term_days', 7
      );
    END IF;

    _org_id := v_shop.organization_id;
  END IF;

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
      'invoice_number_prefix', 'INV',
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
    'default_payment_method', v_profile.default_payment_method,
    'default_payment_term_days', v_profile.default_payment_term_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_billing_context(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: allocate sequential invoice number
-- ---------------------------------------------------------------------------

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
    RETURN 'INV-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));
  END IF;

  v_date := to_char(now(), 'YYMMDD');

  UPDATE public.organization_billing_profiles
  SET next_invoice_sequence = next_invoice_sequence + 1,
      updated_at = now()
  WHERE organization_id = _org_id;

  RETURN trim(both '-' from v_prefix) || '-' || v_date || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_invoice_number(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Invoice insert: org + issuer snapshot
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_invoices_apply_billing_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctx jsonb;
  v_org uuid;
BEGIN
  v_org := COALESCE(NEW.organization_id, public.get_user_organization_id());
  NEW.organization_id := v_org;

  v_ctx := public.get_org_billing_context(v_org);

  IF NEW.currency IS NULL THEN
    NEW.currency := coalesce(v_ctx->>'currency', 'gbp');
  END IF;

  IF NEW.tax_label IS NULL THEN
    NEW.tax_label := coalesce(v_ctx->>'tax_label', 'VAT');
  END IF;

  IF NEW.prices_include_tax IS NULL THEN
    NEW.prices_include_tax := coalesce((v_ctx->>'prices_include_tax')::boolean, false);
  END IF;

  IF NEW.issuer_legal_name IS NULL THEN
    NEW.issuer_legal_name := v_ctx->>'invoice_legal_name';
  END IF;

  IF NEW.issuer_tax_number IS NULL THEN
    NEW.issuer_tax_number := v_ctx->>'tax_registration_number';
  END IF;

  IF NEW.issuer_address IS NULL THEN
    NEW.issuer_address := jsonb_build_object(
      'line1', v_ctx->>'invoice_address_line1',
      'line2', v_ctx->>'invoice_address_line2',
      'city', v_ctx->>'invoice_city',
      'postcode', v_ctx->>'invoice_postcode',
      'country_code', v_ctx->>'country_code',
      'trading_name', v_ctx->>'invoice_trading_name'
    );
  END IF;

  IF NEW.tax_rate IS NULL THEN
    NEW.tax_rate := coalesce((v_ctx->>'default_tax_rate')::numeric, 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_apply_billing_snapshot ON public.invoices;
CREATE TRIGGER invoices_apply_billing_snapshot
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_invoices_apply_billing_snapshot();

-- ---------------------------------------------------------------------------
-- RLS: billing profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.organization_billing_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view billing profile" ON public.organization_billing_profiles;
CREATE POLICY "Org members can view billing profile"
  ON public.organization_billing_profiles FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Org admins can manage billing profile" ON public.organization_billing_profiles;
CREATE POLICY "Org admins can manage billing profile"
  ON public.organization_billing_profiles FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- RLS: invoices scoped to organization
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Staff can view invoices" ON public.invoices;

CREATE POLICY "Org staff can view invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (
    (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id)
      AND (
        public.is_org_admin(organization_id)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'artist'::public.app_role)
        OR public.has_permission(auth.uid(), 'schedule')
        OR public.has_permission(auth.uid(), 'deposits')
        OR public.has_permission(auth.uid(), 'billing')
      )
    )
    OR (
      organization_id IS NULL
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'artist'::public.app_role)
        OR public.has_permission(auth.uid(), 'schedule')
        OR public.has_permission(auth.uid(), 'deposits')
        OR public.has_permission(auth.uid(), 'billing')
      )
    )
  );

CREATE POLICY "Org admins can manage invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (
    (
      organization_id IS NOT NULL
      AND public.is_org_admin(organization_id)
    )
    OR (
      organization_id IS NULL
      AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  )
  WITH CHECK (
    (
      organization_id IS NOT NULL
      AND public.is_org_admin(organization_id)
    )
    OR (
      organization_id IS NULL
      AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

-- Customers policy unchanged (re-create if dropped earlier in chain - it wasn't)
-- "Customers can view own invoices" remains from 20260519180000 migration

-- Velbok platform: shop settings table and removal of legacy Inkaholics/Skin Art branding.

CREATE TABLE IF NOT EXISTS public.shop_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name text NOT NULL DEFAULT 'My Tattoo Studio',
  legal_name text NOT NULL DEFAULT 'My Studio Ltd',
  trading_name text,
  support_email text,
  privacy_email text,
  dpo_email text,
  website_url text,
  address_line1 text,
  address_line2 text,
  city text,
  postcode text,
  country text NOT NULL DEFAULT 'UK',
  accent_color text NOT NULL DEFAULT '#d4af37',
  consent_tattoo_data_storage_text text NOT NULL DEFAULT
    'I give my permission for the studio to store my personal data for legal, medical, and insurance reasons.',
  consent_piercing_data_storage_text text NOT NULL DEFAULT
    'I give my permission for the studio and any piercer in the shop to store my personal data for legal, medical, and insurance reasons.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view shop settings"
  ON public.shop_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage shop settings"
  ON public.shop_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Single default row for current deployment (extend to per-tenant rows later).
INSERT INTO public.shop_settings (shop_name, legal_name, trading_name)
SELECT 'My Tattoo Studio', 'My Studio Ltd', 'My Tattoo Studio'
WHERE NOT EXISTS (SELECT 1 FROM public.shop_settings LIMIT 1);

-- Remove legacy billing entities and reassign linked records to the default company.
DO $$
DECLARE
  default_company_id uuid;
  legacy_ids uuid[];
BEGIN
  SELECT id INTO default_company_id
  FROM public.companies
  WHERE lower(name) NOT IN ('inkaholics', 'skin art')
    AND lower(legal_name) NOT IN ('inkaholics limited', 'skin art solutions ltd')
  ORDER BY created_at
  LIMIT 1;

  IF default_company_id IS NULL THEN
    INSERT INTO public.companies (name, legal_name)
    VALUES ('Default Studio', 'Default Studio Ltd')
    RETURNING id INTO default_company_id;
  END IF;

  SELECT array_agg(id) INTO legacy_ids
  FROM public.companies
  WHERE lower(name) IN ('inkaholics', 'skin art')
     OR lower(legal_name) IN ('inkaholics limited', 'skin art solutions ltd');

  IF legacy_ids IS NOT NULL THEN
    UPDATE public.bookings SET company_id = default_company_id
    WHERE company_id = ANY(legacy_ids);

    UPDATE public.invoices SET company_id = default_company_id
    WHERE company_id = ANY(legacy_ids);

    DELETE FROM public.companies WHERE id = ANY(legacy_ids);
  END IF;
END $$;

-- Keep shop_settings.updated_at in sync.
CREATE OR REPLACE FUNCTION public.set_shop_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_settings_updated_at ON public.shop_settings;
CREATE TRIGGER shop_settings_updated_at
  BEFORE UPDATE ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_shop_settings_updated_at();

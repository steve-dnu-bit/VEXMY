-- Studio Stripe Connect: sole trader (individual) vs limited company.
-- Solo plans choose explicitly in shop setup; other plans default to company.

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS stripe_business_type text;

ALTER TABLE public.shop_settings
  DROP CONSTRAINT IF EXISTS shop_settings_stripe_business_type_check;

ALTER TABLE public.shop_settings
  ADD CONSTRAINT shop_settings_stripe_business_type_check
  CHECK (
    stripe_business_type IS NULL
    OR stripe_business_type IN ('individual', 'company')
  );

COMMENT ON COLUMN public.shop_settings.stripe_business_type IS
  'Stripe Connect Express business_type: individual (sole trader) or company. NULL until chosen.';

-- Shop onboarding wizard fields and completion tracking.

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;

COMMENT ON COLUMN public.shop_settings.logo_url IS 'Shop logo shown in staff app and customer-facing pages.';
COMMENT ON COLUMN public.shop_settings.phone IS 'Primary shop contact phone number.';
COMMENT ON COLUMN public.shop_settings.setup_completed_at IS 'When the subscribing admin finished the shop setup wizard. NULL = setup required.';

-- Existing deployments: do not force current shops through the wizard.
UPDATE public.shop_settings
SET setup_completed_at = COALESCE(setup_completed_at, now())
WHERE setup_completed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_settings_organization_unique
  ON public.shop_settings (organization_id)
  WHERE organization_id IS NOT NULL;

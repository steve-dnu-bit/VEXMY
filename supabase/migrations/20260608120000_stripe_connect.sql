-- Stripe Connect (Express) for per-shop client payment payouts.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_stripe_connect_account
  ON public.organizations (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

COMMENT ON COLUMN public.organizations.stripe_connect_account_id IS 'Stripe Connect Express account (acct_*) for shop client payments.';
COMMENT ON COLUMN public.organizations.stripe_connect_charges_enabled IS 'Synced from Stripe account.updated — true when shop can accept card payments.';

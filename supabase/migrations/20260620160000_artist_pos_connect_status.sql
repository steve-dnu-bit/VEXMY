-- Track artist Connect onboarding status for POS payout splits.

ALTER TABLE public.artist_pos_splits
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded_at timestamptz;

COMMENT ON COLUMN public.artist_pos_splits.stripe_connect_payouts_enabled IS
  'Synced from Stripe account.updated — true when artist Connect account can receive transfers.';
COMMENT ON COLUMN public.artist_pos_splits.stripe_connect_details_submitted IS
  'Synced from Stripe — true when artist finished Connect onboarding form.';
COMMENT ON COLUMN public.artist_pos_splits.stripe_connect_onboarded_at IS
  'When artist Connect onboarding first became ready for POS splits.';

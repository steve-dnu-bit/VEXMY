-- Track Stripe Connect transfers for POS split payouts (separate charges and transfers)

ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS stripe_shop_transfer_id text,
  ADD COLUMN IF NOT EXISTS stripe_artist_transfer_id text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_error text;

COMMENT ON COLUMN public.pos_sales.stripe_shop_transfer_id IS
  'Stripe Transfer id (tr_*) for the shop share, created on the Connect platform account.';
COMMENT ON COLUMN public.pos_sales.stripe_artist_transfer_id IS
  'Stripe Transfer id (tr_*) for the artist share, created on the Connect platform account.';
COMMENT ON COLUMN public.pos_sales.stripe_transfer_error IS
  'Last error when routing POS funds to shop/artist connected accounts.';

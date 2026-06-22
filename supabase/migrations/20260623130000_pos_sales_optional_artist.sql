-- Allow POS sales with no artist when payout is 100% shop (retail / shop-only checkout).

ALTER TABLE public.pos_sales
  ALTER COLUMN artist_id DROP NOT NULL;

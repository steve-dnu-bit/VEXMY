-- Unguessable token so clients can open/download a POS receipt without signing in.
ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS receipt_access_token uuid;

UPDATE public.pos_sales
SET receipt_access_token = gen_random_uuid()
WHERE receipt_access_token IS NULL;

ALTER TABLE public.pos_sales
  ALTER COLUMN receipt_access_token SET DEFAULT gen_random_uuid(),
  ALTER COLUMN receipt_access_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pos_sales_receipt_access_token_uidx
  ON public.pos_sales (receipt_access_token);

COMMENT ON COLUMN public.pos_sales.receipt_access_token IS
  'Public receipt download token (QR / SMS / email link). Not a secret for staff — treat as capability URL.';

-- Per-service deposit settings; allow zero deposit when service does not require one.

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS deposit_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(10,2) NULL;

COMMENT ON COLUMN public.services.deposit_required IS
  'When true, new bookings for this service use deposit_amount or the shop default.';
COMMENT ON COLUMN public.services.deposit_amount IS
  'Optional preset deposit for this service (shop currency). NULL uses shop default_deposit_amount.';

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_deposit_amount_range;

ALTER TABLE public.services
  ADD CONSTRAINT services_deposit_amount_range
  CHECK (deposit_amount IS NULL OR (deposit_amount >= 0.30 AND deposit_amount <= 200));

CREATE OR REPLACE FUNCTION public._valid_deposit_amount(p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v numeric;
BEGIN
  v := round(coalesce(p_amount, 50)::numeric, 2);
  IF v = 0 THEN
    RETURN 0;
  END IF;
  IF v < 0.30 THEN
    RAISE EXCEPTION 'deposit amount must be at least 0.30';
  END IF;
  IF v > 200 THEN
    RAISE EXCEPTION 'deposit amount cannot exceed 200';
  END IF;
  RETURN v;
END;
$$;

-- Billing: payment options on invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS payment_term text NOT NULL DEFAULT 'due';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_payment_method_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_payment_method_check
      CHECK (payment_method IN ('card', 'bank_transfer', 'cash'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_payment_term_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_payment_term_check
      CHECK (payment_term IN ('paid_in_full', 'due'));
  END IF;
END $$;


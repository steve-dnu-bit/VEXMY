-- Track deposit credit applied at desk checkout (linked booking)

ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS deposit_credit_amount numeric(12, 2) NOT NULL DEFAULT 0
    CHECK (deposit_credit_amount >= 0),
  ADD COLUMN IF NOT EXISTS session_total numeric(12, 2)
    CHECK (session_total IS NULL OR session_total >= 0);

COMMENT ON COLUMN public.pos_sales.deposit_credit_amount IS
  'Deposit already paid online, credited against session_total at desk checkout.';
COMMENT ON COLUMN public.pos_sales.session_total IS
  'Full session amount (before deposit credit). total column is the card amount charged.';

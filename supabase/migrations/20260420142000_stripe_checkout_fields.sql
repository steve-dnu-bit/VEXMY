-- Stripe checkout tracking on invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_url text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

CREATE INDEX IF NOT EXISTS invoices_stripe_checkout_session_id_idx
  ON public.invoices (stripe_checkout_session_id);

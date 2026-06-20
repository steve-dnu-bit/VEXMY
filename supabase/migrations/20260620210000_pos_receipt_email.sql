-- POS receipt emails: store client email and track send status

ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS receipt_email_sent_at timestamptz;

COMMENT ON COLUMN public.pos_sales.client_email IS
  'Client email for sending a PDF receipt after checkout.';
COMMENT ON COLUMN public.pos_sales.receipt_email_sent_at IS
  'When the post-checkout receipt email was sent (null = not sent).';

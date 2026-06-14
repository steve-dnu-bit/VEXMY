-- Optional multi-currency platform plan display amounts (Stripe price IDs via secrets or DB).

INSERT INTO public.subscription_plan_prices (plan_id, currency, amount_monthly, stripe_price_id)
VALUES
  ('starter', 'eur', 17.95, NULL),
  ('studio', 'eur', 23.95, NULL),
  ('enterprise', 'eur', 59.95, NULL),
  ('starter', 'usd', 18.95, NULL),
  ('studio', 'usd', 24.95, NULL),
  ('enterprise', 'usd', 62.95, NULL),
  ('starter', 'aud', 22.95, NULL),
  ('studio', 'aud', 29.95, NULL),
  ('enterprise', 'aud', 74.95, NULL),
  ('starter', 'cad', 20.95, NULL),
  ('studio', 'cad', 27.95, NULL),
  ('enterprise', 'cad', 69.95, NULL),
  ('starter', 'sek', 199.00, NULL),
  ('studio', 'sek', 265.00, NULL),
  ('enterprise', 'sek', 649.00, NULL),
  ('starter', 'nok', 199.00, NULL),
  ('studio', 'nok', 265.00, NULL),
  ('enterprise', 'nok', 649.00, NULL),
  ('starter', 'ron', 84.95, NULL),
  ('studio', 'ron', 112.95, NULL),
  ('enterprise', 'ron', 279.95, NULL),
  ('starter', 'bgn', 34.95, NULL),
  ('studio', 'bgn', 46.95, NULL),
  ('enterprise', 'bgn', 116.95, NULL)
ON CONFLICT (plan_id, currency) DO UPDATE SET
  amount_monthly = EXCLUDED.amount_monthly;

COMMENT ON TABLE public.subscription_plan_prices IS
  'Display amounts and optional Stripe price_ IDs per plan/currency. Fallback secrets: STRIPE_PRICE_STARTER_EUR, STRIPE_PRICE_STUDIO_USD, etc.';

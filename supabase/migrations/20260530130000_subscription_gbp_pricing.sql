-- GBP subscription pricing: Starter £29.50, Studio £39.50, Enterprise £59.50 (all monthly).

UPDATE public.subscription_plans SET
  price_gbp_monthly = 29.50,
  is_self_serve = true,
  updated_at = now()
WHERE id = 'starter';

UPDATE public.subscription_plans SET
  price_gbp_monthly = 39.50,
  is_self_serve = true,
  updated_at = now()
WHERE id = 'studio';

UPDATE public.subscription_plans SET
  price_gbp_monthly = 59.50,
  is_self_serve = true,
  trial_days = 14,
  updated_at = now()
WHERE id = 'enterprise';

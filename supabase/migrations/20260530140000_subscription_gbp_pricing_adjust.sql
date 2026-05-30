-- Adjust GBP subscription prices to £29.50 / £39.50 / £59.50.

UPDATE public.subscription_plans SET price_gbp_monthly = 29.50, updated_at = now() WHERE id = 'starter';
UPDATE public.subscription_plans SET price_gbp_monthly = 39.50, updated_at = now() WHERE id = 'studio';
UPDATE public.subscription_plans SET price_gbp_monthly = 59.50, updated_at = now() WHERE id = 'enterprise';

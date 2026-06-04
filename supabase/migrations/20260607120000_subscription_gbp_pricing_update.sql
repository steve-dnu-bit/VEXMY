-- Adjust GBP subscription prices to £14.95 / £19.95 / £29.90.

UPDATE public.subscription_plans SET price_gbp_monthly = 14.95, updated_at = now() WHERE id = 'starter';
UPDATE public.subscription_plans SET price_gbp_monthly = 19.95, updated_at = now() WHERE id = 'studio';
UPDATE public.subscription_plans SET price_gbp_monthly = 29.90, updated_at = now() WHERE id = 'enterprise';

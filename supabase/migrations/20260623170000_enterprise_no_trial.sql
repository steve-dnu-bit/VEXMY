-- Enterprise: charge immediately on subscribe (no 14-day trial).

UPDATE public.subscription_plans
SET trial_days = 0,
    updated_at = now()
WHERE id = 'enterprise';

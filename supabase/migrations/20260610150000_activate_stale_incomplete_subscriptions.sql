-- Checkout can leave platform_subscriptions as incomplete even when the org is active.
-- Treat those as active so feature gates and seat limits work.

UPDATE public.platform_subscriptions ps
SET
  status = 'active',
  current_period_end = COALESCE(ps.current_period_end, now() + interval '1 year'),
  current_period_start = COALESCE(ps.current_period_start, now()),
  updated_at = now()
FROM public.organizations o
WHERE ps.organization_id = o.id
  AND ps.status = 'incomplete'
  AND ps.plan_id IS NOT NULL
  AND o.status = 'active';

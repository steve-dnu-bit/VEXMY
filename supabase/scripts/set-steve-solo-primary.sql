-- Set mr.steve.dnu@gmail.com primary org (Steve D) to Solo subscriber.
UPDATE public.platform_subscriptions ps
SET
  plan_id = 'solo',
  status = 'active',
  trial_end = NULL,
  current_period_start = now(),
  current_period_end = now() + interval '1 year',
  cancel_at_period_end = false,
  canceled_at = NULL,
  updated_at = now()
FROM public.organization_members om
JOIN auth.users u ON u.id = om.user_id
WHERE ps.organization_id = om.organization_id
  AND lower(u.email) = 'mr.steve.dnu@gmail.com'
  AND om.organization_id = (
    SELECT om2.organization_id
    FROM public.organization_members om2
    WHERE om2.user_id = u.id
    ORDER BY
      CASE om2.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      om2.joined_at ASC
    LIMIT 1
  );

UPDATE public.organizations o
SET status = 'active', updated_at = now()
FROM public.organization_members om
JOIN auth.users u ON u.id = om.user_id
WHERE o.id = om.organization_id
  AND lower(u.email) = 'mr.steve.dnu@gmail.com'
  AND om.organization_id = (
    SELECT om2.organization_id
    FROM public.organization_members om2
    WHERE om2.user_id = u.id
    ORDER BY
      CASE om2.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      om2.joined_at ASC
    LIMIT 1
  );

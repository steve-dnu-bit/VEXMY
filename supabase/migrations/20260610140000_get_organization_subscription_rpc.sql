-- Return org subscription for the current user (bypasses RLS; uses resolve_user_organization_id).

CREATE OR REPLACE FUNCTION public.get_organization_subscription_for_user(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _org public.organizations%ROWTYPE;
  _member_role text;
  _sub public.platform_subscriptions%ROWTYPE;
  _plan public.subscription_plans%ROWTYPE;
BEGIN
  IF _user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF _user_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN NULL;
  END IF;

  _org_id := public.resolve_user_organization_id(_user_id);
  IF _org_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO _org FROM public.organizations WHERE id = _org_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT om.role::text INTO _member_role
  FROM public.organization_members om
  WHERE om.organization_id = _org_id AND om.user_id = _user_id;

  SELECT * INTO _sub FROM public.platform_subscriptions WHERE organization_id = _org_id;

  IF _sub.plan_id IS NOT NULL THEN
    SELECT * INTO _plan FROM public.subscription_plans WHERE id = _sub.plan_id;
  END IF;

  RETURN jsonb_build_object(
    'organizationId', _org.id,
    'organizationName', _org.name,
    'organizationSlug', _org.slug,
    'memberRole', _member_role,
    'subscription', CASE
      WHEN _sub.id IS NOT NULL THEN jsonb_build_object(
        'id', _sub.id,
        'planId', _sub.plan_id,
        'status', _sub.status,
        'currentPeriodEnd', _sub.current_period_end,
        'cancelAtPeriodEnd', _sub.cancel_at_period_end,
        'trialEnd', _sub.trial_end
      )
      ELSE NULL
    END,
    'plan', CASE
      WHEN _plan.id IS NOT NULL THEN jsonb_build_object(
        'id', _plan.id,
        'name', _plan.name,
        'description', _plan.description,
        'price_gbp_monthly', _plan.price_gbp_monthly,
        'max_artist_seats', _plan.max_artist_seats,
        'trial_days', _plan.trial_days,
        'features', _plan.features
      )
      ELSE NULL
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_subscription_for_user(uuid) TO authenticated;

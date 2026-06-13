-- Expose gratuity flag in platform admin studio list.

CREATE OR REPLACE FUNCTION public.platform_admin_list_studios()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.platform_admin_assert();

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY row_data ->> 'createdAt' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', o.id,
          'name', o.name,
          'slug', o.slug,
          'status', o.status,
          'createdAt', o.created_at,
          'ownerUserId', o.owner_user_id,
          'ownerEmail', owner.email,
          'shopName', ss.shop_name,
          'planId', ps.plan_id,
          'planName', sp.name,
          'subscriptionStatus', ps.status,
          'trialEnd', ps.trial_end,
          'currentPeriodEnd', ps.current_period_end,
          'cancelAtPeriodEnd', COALESCE(ps.cancel_at_period_end, false),
          'stripeSubscriptionId', ps.stripe_subscription_id,
          'isGratuity', (
            ps.status IN ('trialing', 'active', 'past_due')
            AND ps.stripe_subscription_id IS NULL
          ),
          'memberCount', (
            SELECT COUNT(*)::int FROM public.organization_members om
            WHERE om.organization_id = o.id
          ),
          'artistSeats', public.org_artist_seat_count(o.id)
        ) AS row_data
        FROM public.organizations o
        LEFT JOIN public.platform_subscriptions ps ON ps.organization_id = o.id
        LEFT JOIN public.subscription_plans sp ON sp.id = ps.plan_id
        LEFT JOIN public.shop_settings ss ON ss.organization_id = o.id
        LEFT JOIN auth.users owner ON owner.id = o.owner_user_id
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

-- Grant RPC: clear Stripe linkage so gratuity is not overwritten by webhooks.
CREATE OR REPLACE FUNCTION public.platform_admin_grant_subscription(
  _org_id uuid,
  _plan_id text,
  _months integer DEFAULT 12,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _months_safe integer;
  _period_end timestamptz;
BEGIN
  PERFORM public.platform_admin_assert();

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id_required';
  END IF;

  IF _plan_id IS NULL OR _plan_id NOT IN ('starter', 'studio', 'enterprise') THEN
    RAISE EXCEPTION 'invalid_plan_id';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _org_id) THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id = _plan_id) THEN
    RAISE EXCEPTION 'plan_not_found';
  END IF;

  _months_safe := GREATEST(1, LEAST(COALESCE(_months, 12), 120));
  _period_end := now() + make_interval(months => _months_safe);

  INSERT INTO public.platform_subscriptions (
    organization_id,
    plan_id,
    status,
    stripe_subscription_id,
    stripe_price_id,
    trial_end,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at
  ) VALUES (
    _org_id,
    _plan_id,
    'active',
    NULL,
    NULL,
    NULL,
    now(),
    _period_end,
    false,
    NULL
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    stripe_subscription_id = NULL,
    stripe_price_id = NULL,
    trial_end = EXCLUDED.trial_end,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = false,
    canceled_at = NULL,
    updated_at = now();

  UPDATE public.organizations
  SET status = 'active', updated_at = now()
  WHERE id = _org_id;

  INSERT INTO public.subscription_events (organization_id, event_type, payload)
  VALUES (
    _org_id,
    'platform_admin_gratuity',
    jsonb_build_object(
      'plan_id', _plan_id,
      'months', _months_safe,
      'period_end', _period_end,
      'note', _note,
      'granted_by', auth.uid()
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'organizationId', _org_id,
    'planId', _plan_id,
    'status', 'active',
    'isGratuity', true,
    'currentPeriodEnd', _period_end
  );
END;
$$;

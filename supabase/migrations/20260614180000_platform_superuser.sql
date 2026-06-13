-- Platform superuser: cross-tenant admin dashboard (grant subs, view all studios/users).
-- Seed: mr.tattooist@hotmail.com

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_admins IS 'Velbok platform operators — full cross-tenant read and complimentary subscription grants.';

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_assert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_is_me()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  PERFORM public.platform_admin_assert();

  SELECT jsonb_build_object(
    'totalStudios', (SELECT COUNT(*)::int FROM public.organizations),
    'activeSubscriptions', (
      SELECT COUNT(*)::int FROM public.platform_subscriptions
      WHERE status IN ('trialing', 'active', 'past_due')
    ),
    'trialing', (SELECT COUNT(*)::int FROM public.platform_subscriptions WHERE status = 'trialing'),
    'canceled', (SELECT COUNT(*)::int FROM public.platform_subscriptions WHERE status = 'canceled'),
    'pastDue', (SELECT COUNT(*)::int FROM public.platform_subscriptions WHERE status = 'past_due'),
    'noSubscription', (
      SELECT COUNT(*)::int FROM public.organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM public.platform_subscriptions ps WHERE ps.organization_id = o.id
      )
    ),
    'totalUsers', (SELECT COUNT(*)::int FROM public.profiles),
    'customers', (
      SELECT COUNT(DISTINCT ur.user_id)::int FROM public.user_roles ur WHERE ur.role = 'customer'
    ),
    'artists', (
      SELECT COUNT(DISTINCT ur.user_id)::int FROM public.user_roles ur WHERE ur.role = 'artist'
    ),
    'studioAdmins', (
      SELECT COUNT(DISTINCT ur.user_id)::int FROM public.user_roles ur WHERE ur.role = 'admin'
    )
  ) INTO _result;

  RETURN _result;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.platform_admin_list_users(
  _search text DEFAULT NULL,
  _role text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _needle text;
BEGIN
  PERFORM public.platform_admin_assert();
  _needle := NULLIF(trim(lower(_search)), '');

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY row_data ->> 'displayName')
      FROM (
        SELECT jsonb_build_object(
          'userId', p.user_id,
          'displayName', p.display_name,
          'email', u.email,
          'createdAt', p.created_at,
          'roles', COALESCE((
            SELECT jsonb_agg(ur.role::text ORDER BY ur.role::text)
            FROM public.user_roles ur
            WHERE ur.user_id = p.user_id
          ), '[]'::jsonb),
          'organizationName', (
            SELECT o.name
            FROM public.organization_members om
            JOIN public.organizations o ON o.id = om.organization_id
            WHERE om.user_id = p.user_id
            ORDER BY CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
            LIMIT 1
          ),
          'subscriptionStatus', (
            SELECT ps.status::text
            FROM public.organization_members om
            JOIN public.platform_subscriptions ps ON ps.organization_id = om.organization_id
            WHERE om.user_id = p.user_id
            ORDER BY CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
            LIMIT 1
          ),
          'planId', (
            SELECT ps.plan_id
            FROM public.organization_members om
            JOIN public.platform_subscriptions ps ON ps.organization_id = om.organization_id
            WHERE om.user_id = p.user_id
            ORDER BY CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
            LIMIT 1
          )
        ) AS row_data
        FROM public.profiles p
        JOIN auth.users u ON u.id = p.user_id
        WHERE (_needle IS NULL OR lower(p.display_name) LIKE '%' || _needle || '%' OR lower(u.email) LIKE '%' || _needle || '%')
          AND (
            _role IS NULL
            OR EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = p.user_id AND ur.role::text = _role
            )
          )
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_recent_events(_limit integer DEFAULT 50)
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
      SELECT jsonb_agg(row_data ORDER BY row_data ->> 'processedAt' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', se.id,
          'organizationId', se.organization_id,
          'organizationName', o.name,
          'eventType', se.event_type,
          'processedAt', se.processed_at,
          'payload', se.payload
        ) AS row_data
        FROM public.subscription_events se
        LEFT JOIN public.organizations o ON o.id = se.organization_id
        ORDER BY se.processed_at DESC
        LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200))
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

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
    trial_end,
    current_period_start,
    current_period_end,
    cancel_at_period_end
  ) VALUES (
    _org_id,
    _plan_id,
    'active',
    NULL,
    now(),
    _period_end,
    false
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
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
    'platform_admin_grant',
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
    'currentPeriodEnd', _period_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_admin_set_subscription_status(
  _org_id uuid,
  _status public.subscription_status
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.platform_admin_assert();

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id_required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_subscriptions WHERE organization_id = _org_id) THEN
    RAISE EXCEPTION 'subscription_not_found';
  END IF;

  UPDATE public.platform_subscriptions
  SET
    status = _status,
    canceled_at = CASE WHEN _status = 'canceled' THEN now() ELSE canceled_at END,
    updated_at = now()
  WHERE organization_id = _org_id;

  IF _status = 'canceled' THEN
    UPDATE public.organizations SET status = 'canceled', updated_at = now() WHERE id = _org_id;
  ELSIF _status IN ('trialing', 'active', 'past_due') THEN
    UPDATE public.organizations SET status = 'active', updated_at = now() WHERE id = _org_id;
  END IF;

  INSERT INTO public.subscription_events (organization_id, event_type, payload)
  VALUES (
    _org_id,
    'platform_admin_status_change',
    jsonb_build_object(
      'status', _status,
      'changed_by', auth.uid()
    )
  );

  RETURN jsonb_build_object('ok', true, 'organizationId', _org_id, 'status', _status);
END;
$$;

-- Seed initial platform superuser
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE lower(email) = 'mr.tattooist@hotmail.com'
ON CONFLICT (user_id) DO NOTHING;

GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_is_me() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_list_studios() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_list_users(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_recent_events(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_grant_subscription(uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_set_subscription_status(uuid, public.subscription_status) TO authenticated;

-- Plan-based AI stencil quota (rolling 24h, per user): Starter 3, Studio 6, Enterprise 10.

CREATE TABLE IF NOT EXISTS public.stencil_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stencil_usage_user_recent
  ON public.stencil_usage (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stencil_usage_org_user_recent
  ON public.stencil_usage (organization_id, user_id, created_at DESC);

ALTER TABLE public.stencil_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own stencil usage" ON public.stencil_usage;
CREATE POLICY "Users read own stencil usage"
  ON public.stencil_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own stencil usage" ON public.stencil_usage;
CREATE POLICY "Users insert own stencil usage"
  ON public.stencil_usage FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own stencil usage" ON public.stencil_usage;
CREATE POLICY "Users delete own stencil usage"
  ON public.stencil_usage FOR DELETE TO authenticated
  USING (user_id = auth.uid());

UPDATE public.subscription_plans SET
  features = features || '{"stencil_max_per_24h": 3}'::jsonb,
  updated_at = now()
WHERE id = 'starter';

UPDATE public.subscription_plans SET
  features = features || '{"stencil_max_per_24h": 6}'::jsonb,
  updated_at = now()
WHERE id = 'studio';

UPDATE public.subscription_plans SET
  features = features || '{"stencil_max_per_24h": 10}'::jsonb,
  updated_at = now()
WHERE id = 'enterprise';

CREATE OR REPLACE FUNCTION public.stencil_quota_limit_for_user(_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_max integer;
BEGIN
  IF _user_id IS NULL THEN
    RETURN 3;
  END IF;

  v_org_id := public.get_user_organization_id(_user_id);
  v_max := COALESCE(public.org_plan_feature_number(v_org_id, 'stencil_max_per_24h')::integer, 0);

  IF v_max < 1 THEN
    RETURN 3;
  END IF;

  RETURN v_max;
END;
$$;

CREATE OR REPLACE FUNCTION public.stencil_quota_status(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(_user_id, auth.uid());
  v_org_id uuid;
  v_limit integer;
  v_used integer;
  v_oldest timestamptz;
  v_resets_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('used', 0, 'limit', 3, 'remaining', 3, 'resets_at', null);
  END IF;

  v_org_id := public.get_user_organization_id(v_user_id);
  v_limit := public.stencil_quota_limit_for_user(v_user_id);

  SELECT count(*)::integer, min(created_at)
  INTO v_used, v_oldest
  FROM public.stencil_usage
  WHERE user_id = v_user_id
    AND created_at > now() - interval '24 hours'
    AND (
      organization_id IS NULL
      OR v_org_id IS NULL
      OR organization_id = v_org_id
    );

  v_resets_at := CASE
    WHEN v_oldest IS NOT NULL THEN v_oldest + interval '24 hours'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'used', COALESCE(v_used, 0),
    'limit', v_limit,
    'remaining', GREATEST(v_limit - COALESCE(v_used, 0), 0),
    'resets_at', v_resets_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_stencil_quota(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(_user_id, auth.uid());
  v_org_id uuid;
  v_limit integer;
  v_used integer;
  v_usage_id uuid;
  v_status jsonb;
BEGIN
  IF v_user_id IS NULL OR v_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('allowed', false, 'used', 0, 'limit', 3, 'remaining', 0);
  END IF;

  v_org_id := public.get_user_organization_id(v_user_id);
  v_limit := public.stencil_quota_limit_for_user(v_user_id);

  SELECT count(*)::integer INTO v_used
  FROM public.stencil_usage
  WHERE user_id = v_user_id
    AND created_at > now() - interval '24 hours'
    AND (
      organization_id IS NULL
      OR v_org_id IS NULL
      OR organization_id = v_org_id
    );

  IF COALESCE(v_used, 0) >= v_limit THEN
    v_status := public.stencil_quota_status(v_user_id);
    RETURN v_status || jsonb_build_object('allowed', false, 'usage_id', null);
  END IF;

  INSERT INTO public.stencil_usage (user_id, organization_id)
  VALUES (v_user_id, v_org_id)
  RETURNING id INTO v_usage_id;

  v_status := public.stencil_quota_status(v_user_id);
  RETURN v_status || jsonb_build_object('allowed', true, 'usage_id', v_usage_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_stencil_quota(_usage_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(_user_id, auth.uid());
BEGIN
  IF v_user_id IS NULL OR _usage_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.stencil_usage
  WHERE id = _usage_id
    AND user_id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.stencil_quota_limit_for_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stencil_quota_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_stencil_quota(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_stencil_quota(uuid, uuid) TO authenticated, service_role;

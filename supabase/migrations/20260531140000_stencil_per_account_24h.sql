-- Flat AI-stencil allowance of 10 generations per account over a rolling 24-hour
-- window, plus 24-hour retention for generated stencils.
--
-- Previously the allowance was one generation per occupied artist seat (capped at
-- 10) per organization, reset at midnight. It is now a fixed 10 per account
-- (signed-in user), measured over the trailing 24 hours — so each artist gets up
-- to 10 AI stencils in any 24-hour period, independent of studio size. Generated
-- stencils are also retained for 24 hours (was 12) before the purge job removes
-- them.

-- 1. Extend retention from 12h to 24h for newly created stencils.
ALTER TABLE public.stencils
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours');

-- 2. Flat allowance of 10 (per account). The _org_id argument is kept for
--    signature compatibility but no longer affects the limit.
CREATE OR REPLACE FUNCTION public.stencil_daily_limit(_org_id uuid)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 10;
$$;

-- 3. Read-only status used by the UI countdown — per account, rolling 24 hours.
CREATE OR REPLACE FUNCTION public.stencil_quota_status(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer := 10;
  _used integer;
  _oldest timestamptz;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('used', 0, 'limit', 0, 'remaining', 0);
  END IF;

  SELECT count(*), min(created_at) INTO _used, _oldest
  FROM public.stencil_usage
  WHERE user_id = _user_id
    AND created_at >= now() - interval '24 hours';

  RETURN jsonb_build_object(
    'used', _used,
    'limit', _limit,
    'remaining', GREATEST(0, _limit - _used),
    'resets_at', COALESCE(_oldest + interval '24 hours', now() + interval '24 hours')
  );
END;
$$;

-- 4. Atomic claim — per account, rolling 24-hour window. Returns allowed=false
--    when the account has already made 10 generations in the last 24 hours.
CREATE OR REPLACE FUNCTION public.claim_stencil_quota(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _limit integer := 10;
  _used integer;
  _oldest timestamptz;
  _usage_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'unauthorized');
  END IF;

  -- Org is still recorded on the ledger row for reporting, but the cap is
  -- counted per account.
  _org_id := public._stencil_org_for_user(_user_id);

  -- Serialize concurrent claims for the same account so two simultaneous
  -- requests cannot both slip past the cap.
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 0));

  SELECT count(*), min(created_at) INTO _used, _oldest
  FROM public.stencil_usage
  WHERE user_id = _user_id
    AND created_at >= now() - interval '24 hours';

  IF _used >= _limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', _used,
      'limit', _limit,
      'remaining', 0,
      'resets_at', COALESCE(_oldest + interval '24 hours', now() + interval '24 hours')
    );
  END IF;

  INSERT INTO public.stencil_usage (organization_id, user_id)
  VALUES (_org_id, _user_id)
  RETURNING id INTO _usage_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'usage_id', _usage_id,
    'used', _used + 1,
    'limit', _limit,
    'remaining', GREATEST(0, _limit - _used - 1),
    'resets_at', COALESCE(_oldest + interval '24 hours', now() + interval '24 hours')
  );
END;
$$;

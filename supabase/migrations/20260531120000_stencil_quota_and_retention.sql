-- AI stencil daily quota (1 generation/day per artist seat, per organization)
-- and 12-hour retention for generated stencils.
--
-- Quota is tracked in a dedicated ledger (public.stencil_usage) that is NOT
-- deleted when the stencil image is purged after 12 hours, so daily counts stay
-- accurate. Only AI generations (which spend Netlify credits) are recorded; the
-- free in-browser engine does not touch this ledger.

-- 1. 12-hour retention marker on stencils.
ALTER TABLE public.stencils
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours');

-- Backfill any pre-existing rows so the purge job has a deadline for them too.
UPDATE public.stencils
  SET expires_at = created_at + interval '12 hours'
  WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stencils_expires_at ON public.stencils (expires_at);

-- 2. Persistent usage ledger for quota accounting.
CREATE TABLE IF NOT EXISTS public.stencil_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stencil_usage_org_created ON public.stencil_usage (organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stencil_usage_user_created ON public.stencil_usage (user_id, created_at);

ALTER TABLE public.stencil_usage ENABLE ROW LEVEL SECURITY;

-- Members may read their own / their org's usage (so the UI can show remaining
-- quota). Writes happen only through the SECURITY DEFINER RPCs below.
DROP POLICY IF EXISTS "Org members view stencil usage" ON public.stencil_usage;
CREATE POLICY "Org members view stencil usage"
  ON public.stencil_usage
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()))
  );

-- 3. Quota helpers.

-- Resolve the organization a user belongs to, falling back to the single
-- organization when the deployment is single-tenant.
CREATE OR REPLACE FUNCTION public._stencil_org_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.get_user_organization_id(_user_id),
    (
      SELECT id FROM public.organizations
      WHERE (SELECT count(*) FROM public.organizations) = 1
      LIMIT 1
    )
  );
$$;

-- Daily allowance = one generation per occupied artist seat (min 1).
CREATE OR REPLACE FUNCTION public.stencil_daily_limit(_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(1, COALESCE(public.org_artist_seat_count(_org_id), 1));
$$;

-- Read-only status used by the UI.
CREATE OR REPLACE FUNCTION public.stencil_quota_status(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _limit integer;
  _used integer;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('used', 0, 'limit', 0, 'remaining', 0);
  END IF;

  _org_id := public._stencil_org_for_user(_user_id);
  _limit := public.stencil_daily_limit(_org_id);

  SELECT count(*) INTO _used
  FROM public.stencil_usage
  WHERE created_at >= date_trunc('day', now())
    AND (
      (_org_id IS NOT NULL AND organization_id = _org_id)
      OR (_org_id IS NULL AND user_id = _user_id)
    );

  RETURN jsonb_build_object(
    'used', _used,
    'limit', _limit,
    'remaining', GREATEST(0, _limit - _used),
    'resets_at', (date_trunc('day', now()) + interval '1 day')
  );
END;
$$;

-- Atomically check the daily allowance and, if room remains, record one use.
-- Returns allowed=false (and no row) when the org is at its cap for the day.
CREATE OR REPLACE FUNCTION public.claim_stencil_quota(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _limit integer;
  _used integer;
  _usage_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'unauthorized');
  END IF;

  _org_id := public._stencil_org_for_user(_user_id);

  -- Serialize concurrent claims for the same org (or user when no org) so two
  -- simultaneous requests cannot both slip past the cap.
  PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(_org_id::text, _user_id::text), 0));

  _limit := public.stencil_daily_limit(_org_id);

  SELECT count(*) INTO _used
  FROM public.stencil_usage
  WHERE created_at >= date_trunc('day', now())
    AND (
      (_org_id IS NOT NULL AND organization_id = _org_id)
      OR (_org_id IS NULL AND user_id = _user_id)
    );

  IF _used >= _limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used', _used,
      'limit', _limit,
      'remaining', 0,
      'resets_at', (date_trunc('day', now()) + interval '1 day')
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
    'resets_at', (date_trunc('day', now()) + interval '1 day')
  );
END;
$$;

-- Release a claim when generation fails after claiming (so a failed render does
-- not burn the artist's daily allowance). Only the claimant can refund, and only
-- shortly after claiming.
CREATE OR REPLACE FUNCTION public.refund_stencil_quota(_usage_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.stencil_usage
  WHERE id = _usage_id
    AND user_id = _user_id
    AND created_at >= now() - interval '1 hour';
$$;

GRANT EXECUTE ON FUNCTION public.stencil_quota_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stencil_quota(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_stencil_quota(uuid, uuid) TO authenticated;

-- Isolate Google Play review / sandbox accounts from production studio organizations.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.is_sandbox IS
  'True for demo / Play Review tenants. Sandbox users must not join production orgs.';

UPDATE public.organizations
SET is_sandbox = true
WHERE slug = 'velbok-play-review';

CREATE OR REPLACE FUNCTION public.is_play_review_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = _user_id
      AND (
        lower(coalesce(u.email, '')) LIKE '%+play-%@gmail.com'
        OR coalesce(u.raw_user_meta_data ->> 'play_review', '') = 'true'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_play_review_org_isolation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sandbox boolean;
  v_is_play boolean;
BEGIN
  v_is_play := public.is_play_review_user(NEW.user_id);

  SELECT COALESCE(o.is_sandbox, false)
  INTO v_sandbox
  FROM public.organizations o
  WHERE o.id = NEW.organization_id;

  IF v_is_play AND NOT v_sandbox THEN
    RAISE EXCEPTION 'Play review accounts cannot join production organizations';
  END IF;

  IF NOT v_is_play AND v_sandbox AND NOT public.is_platform_admin(NEW.user_id) THEN
    RAISE EXCEPTION 'Production accounts cannot join the Play Review sandbox organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_play_review_org_isolation ON public.organization_members;

CREATE TRIGGER trg_play_review_org_isolation
  BEFORE INSERT OR UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_play_review_org_isolation();

-- Remove any Play Review users accidentally linked to real studios.
DELETE FROM public.organization_members om
USING auth.users u, public.organizations o
WHERE om.user_id = u.id
  AND om.organization_id = o.id
  AND public.is_play_review_user(u.id)
  AND COALESCE(o.is_sandbox, false) = false;

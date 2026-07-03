-- Studio staff (admin/artist) may belong to only one organization at a time.
-- Does not remove existing memberships — only blocks new cross-org staff joins.

CREATE OR REPLACE FUNCTION public.is_studio_staff_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin'::public.app_role, 'artist'::public.app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.studio_staff_blocking_org(
  _user_id uuid,
  _target_org_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id
  FROM public.organization_members om
  WHERE om.user_id = _user_id
    AND om.organization_id IS DISTINCT FROM _target_org_id
    AND public.is_studio_staff_user(_user_id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_studio_staff_join_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin(_user_id)
    OR public.is_play_review_user(_user_id)
    OR NOT public.is_studio_staff_user(_user_id)
    OR public.studio_staff_blocking_org(_user_id, _org_id) IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.enforce_single_org_studio_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF public.is_platform_admin(NEW.user_id) OR public.is_play_review_user(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_studio_staff_user(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  IF public.studio_staff_blocking_org(NEW.user_id, NEW.organization_id) IS NOT NULL THEN
    RAISE EXCEPTION 'studio_staff_single_org_only'
      USING
        HINT = 'Release this artist from their current studio before they can join another organization.',
        DETAIL = 'studio_staff_single_org_only';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_org_studio_staff ON public.organization_members;

CREATE TRIGGER trg_single_org_studio_staff
  BEFORE INSERT OR UPDATE OF organization_id, user_id ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_org_studio_staff();

GRANT EXECUTE ON FUNCTION public.is_studio_staff_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.studio_staff_blocking_org(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_studio_staff_join_org(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.is_studio_staff_user(uuid) IS
  'True when the user has admin or artist app role (studio staff, not customer-only).';

COMMENT ON FUNCTION public.can_studio_staff_join_org(uuid, uuid) IS
  'False when studio staff already belongs to a different organization.';

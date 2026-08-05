-- Ringfence organizations: studio staff belong to one org; profiles/roles are org-scoped;
-- sandbox review accounts stay out of production studios; booking auto-add must not
-- re-attach another studio's staff into a shop roster.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.shares_organization_with(_viewer uuid, _subject uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _viewer IS NOT NULL
    AND _subject IS NOT NULL
    AND (
      _viewer = _subject
      OR EXISTS (
        SELECT 1
        FROM public.organization_members viewer_om
        JOIN public.organization_members subject_om
          ON subject_om.organization_id = viewer_om.organization_id
        WHERE viewer_om.user_id = _viewer
          AND subject_om.user_id = _subject
      )
    );
$$;

COMMENT ON FUNCTION public.shares_organization_with(uuid, uuid) IS
  'True when viewer and subject share an organization membership (or are the same user). Platform admins use security-definer RPCs for cross-tenant access.';

CREATE OR REPLACE FUNCTION public.detach_user_from_other_organizations(
  _user_id uuid,
  _keep_org_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF _user_id IS NULL OR _keep_org_id IS NULL THEN
    RETURN 0;
  END IF;

  IF public.is_platform_admin(_user_id) OR public.is_play_review_user(_user_id) THEN
    RETURN 0;
  END IF;

  DELETE FROM public.organization_members
  WHERE user_id = _user_id
    AND organization_id IS DISTINCT FROM _keep_org_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.detach_user_from_other_organizations(uuid, uuid) IS
  'Removes all organization_members rows for a user except the kept organization.';

GRANT EXECUTE ON FUNCTION public.shares_organization_with(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detach_user_from_other_organizations(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Single-org staff: block staff joins; silently skip client auto-add of foreign staff
-- ---------------------------------------------------------------------------

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

  IF public.studio_staff_blocking_org(NEW.user_id, NEW.organization_id) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Booking / invite paths often INSERT role=member for clients. Never pull another
  -- studio's owner/admin/artist onto this roster (and do not fail the booking).
  IF NEW.role = 'member'::public.org_member_role THEN
    RETURN NULL;
  END IF;

  -- Staff joining as owner/admin/artist of a new org: release other memberships first.
  IF NEW.role IN ('owner'::public.org_member_role, 'admin'::public.org_member_role) THEN
    PERFORM public.detach_user_from_other_organizations(NEW.user_id, NEW.organization_id);
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'studio_staff_single_org_only'
    USING
      HINT = 'Release this artist from their current studio before they can join another organization.',
      DETAIL = 'studio_staff_single_org_only';
END;
$$;

-- When a user becomes studio staff, keep only their primary organization membership.
CREATE OR REPLACE FUNCTION public.enforce_staff_role_single_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep uuid;
BEGIN
  IF NEW.role NOT IN ('admin'::public.app_role, 'artist'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF public.is_platform_admin(NEW.user_id) OR public.is_play_review_user(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  v_keep := public.get_user_organization_id(NEW.user_id);
  IF v_keep IS NOT NULL THEN
    PERFORM public.detach_user_from_other_organizations(NEW.user_id, v_keep);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_role_single_org ON public.user_roles;
CREATE TRIGGER trg_staff_role_single_org
  AFTER INSERT OR UPDATE OF role, user_id ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_staff_role_single_org();

-- ---------------------------------------------------------------------------
-- Profiles / roles RLS: org peers only (not every authenticated user)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Org peers can view profiles" ON public.profiles;
CREATE POLICY "Org peers can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.shares_organization_with(auth.uid(), user_id));

DROP POLICY IF EXISTS "Staff can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org peers can view roles" ON public.user_roles;
CREATE POLICY "Org peers can view roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.shares_organization_with(auth.uid(), user_id));

-- ---------------------------------------------------------------------------
-- Data cleanup (existing dual memberships + sandbox leaks)
-- ---------------------------------------------------------------------------

-- Studio staff keep only their primary org (owner > admin > member, then earliest join).
DELETE FROM public.organization_members om
WHERE public.is_studio_staff_user(om.user_id)
  AND NOT public.is_platform_admin(om.user_id)
  AND NOT public.is_play_review_user(om.user_id)
  AND om.organization_id IS DISTINCT FROM public.get_user_organization_id(om.user_id);

-- Sandbox / App Store / Play review accounts must not remain on production studios.
-- Keep (and sandbox-mark) any org they own so review accounts are not locked out.
UPDATE public.organizations o
SET is_sandbox = true
FROM auth.users u
WHERE o.owner_user_id = u.id
  AND public.is_play_review_user(u.id)
  AND COALESCE(o.is_sandbox, false) = false;

DELETE FROM public.organization_members om
USING auth.users u, public.organizations o
WHERE om.user_id = u.id
  AND om.organization_id = o.id
  AND public.is_play_review_user(u.id)
  AND COALESCE(o.is_sandbox, false) = false
  AND o.owner_user_id IS DISTINCT FROM u.id;

-- Restore owner membership on sandbox orgs owned by review accounts (idempotent).
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT o.id, o.owner_user_id, 'owner'::public.org_member_role
FROM public.organizations o
JOIN auth.users u ON u.id = o.owner_user_id
WHERE public.is_play_review_user(u.id)
  AND o.owner_user_id IS NOT NULL
  AND COALESCE(o.is_sandbox, false) = true
ON CONFLICT (organization_id, user_id) DO NOTHING;

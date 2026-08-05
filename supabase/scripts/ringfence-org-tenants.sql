-- One-off verification + cleanup for org ringfencing.
-- Safe to run in Supabase SQL editor after migration 20260805140000_org_tenant_ringfencing.sql.

-- 1) Dual memberships (studio staff in more than one org) — should be empty after migration.
SELECT u.email, o.name, o.slug, om.role, om.joined_at
FROM public.organization_members om
JOIN auth.users u ON u.id = om.user_id
JOIN public.organizations o ON o.id = om.organization_id
WHERE public.is_studio_staff_user(om.user_id)
  AND NOT public.is_platform_admin(om.user_id)
  AND EXISTS (
    SELECT 1
    FROM public.organization_members om2
    WHERE om2.user_id = om.user_id
      AND om2.organization_id IS DISTINCT FROM om.organization_id
  )
ORDER BY u.email, o.name;

-- 2) johnvelbokapple memberships — should only be their solo org as owner.
SELECT u.email, o.name, o.slug, om.role, om.joined_at
FROM public.organization_members om
JOIN auth.users u ON u.id = om.user_id
JOIN public.organizations o ON o.id = om.organization_id
WHERE lower(u.email) IN ('johnapplevelbok@gmail.com', 'johnvelbokapple@gmail.com')
ORDER BY om.joined_at;

-- 3) Brentwood / Inkaholics roster — should not include john or review sandbox users.
SELECT u.email, om.role, o.name, o.slug, COALESCE(o.is_sandbox, false) AS is_sandbox
FROM public.organization_members om
JOIN auth.users u ON u.id = om.user_id
JOIN public.organizations o ON o.id = om.organization_id
WHERE o.slug IN ('brentwood-inkaholics', 'default-studio')
   OR lower(o.name) LIKE '%inkaholic%'
   OR lower(o.name) LIKE '%brentwood%'
ORDER BY o.slug, u.email;

-- 4) Force-detach john from every org except the one they own (if still leaking).
DO $$
DECLARE
  v_uid uuid;
  v_keep uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users
  WHERE lower(email) IN ('johnapplevelbok@gmail.com', 'johnvelbokapple@gmail.com')
  LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'john apple solo account not found';
    RETURN;
  END IF;

  SELECT organization_id INTO v_keep
  FROM public.organization_members
  WHERE user_id = v_uid AND role = 'owner'
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_keep IS NULL THEN
    RAISE NOTICE 'No owner org for john — skip detach';
    RETURN;
  END IF;

  PERFORM public.detach_user_from_other_organizations(v_uid, v_keep);
  RAISE NOTICE 'Detached john from orgs other than %', v_keep;
END $$;

-- 5) Remove Play / Apple review accounts from production studios.
DELETE FROM public.organization_members om
USING auth.users u, public.organizations o
WHERE om.user_id = u.id
  AND om.organization_id = o.id
  AND public.is_play_review_user(u.id)
  AND COALESCE(o.is_sandbox, false) = false;

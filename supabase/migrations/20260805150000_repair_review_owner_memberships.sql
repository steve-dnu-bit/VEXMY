-- Repair: App Store / Play review accounts that own a studio must keep that org
-- as sandbox + owner membership (ringfence cleanup must not lock them out).

UPDATE public.organizations o
SET is_sandbox = true, updated_at = now()
FROM auth.users u
WHERE o.owner_user_id = u.id
  AND public.is_play_review_user(u.id)
  AND COALESCE(o.is_sandbox, false) = false;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT o.id, o.owner_user_id, 'owner'::public.org_member_role
FROM public.organizations o
JOIN auth.users u ON u.id = o.owner_user_id
WHERE public.is_play_review_user(u.id)
  AND o.owner_user_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

-- Keep dedicated Apple review sandbox roster populated for appletest accounts.
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT o.id, u.id, 'member'::public.org_member_role
FROM public.organizations o
CROSS JOIN auth.users u
WHERE o.slug = 'velbok-apple-review'
  AND lower(u.email) IN ('appletest@velbok.com', 'appletest2@velbok.com')
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Production studios must still not host review accounts except as owners of their own sandbox org.
DELETE FROM public.organization_members om
USING auth.users u, public.organizations o
WHERE om.user_id = u.id
  AND om.organization_id = o.id
  AND public.is_play_review_user(u.id)
  AND COALESCE(o.is_sandbox, false) = false
  AND o.owner_user_id IS DISTINCT FROM u.id;

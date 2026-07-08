-- One-off cleanup: remove Google Play review users from production organizations.
-- Safe to run in Supabase SQL editor. Re-run after migrations if needed.

DELETE FROM public.organization_members om
USING auth.users u, public.organizations o
WHERE om.user_id = u.id
  AND om.organization_id = o.id
  AND (
    lower(coalesce(u.email, '')) LIKE '%+play-%@gmail.com'
    OR coalesce(u.raw_user_meta_data ->> 'play_review', '') = 'true'
  )
  AND o.slug <> 'velbok-play-review';

-- Verify: should return zero rows for Inkaholics / Default Studio members.
SELECT u.email, o.name, o.slug, om.role
FROM public.organization_members om
JOIN auth.users u ON u.id = om.user_id
JOIN public.organizations o ON o.id = om.organization_id
WHERE lower(coalesce(u.email, '')) LIKE '%+play-%@gmail.com'
ORDER BY o.name, u.email;

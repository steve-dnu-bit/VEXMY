-- Allow App Store review accounts (@velbok.com appletest*) into sandbox orgs.
-- Same isolation rules as Google Play review users.

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
        OR lower(coalesce(u.email, '')) IN ('appletest@velbok.com', 'appletest2@velbok.com')
        OR coalesce(u.raw_user_meta_data ->> 'play_review', '') = 'true'
        OR coalesce(u.raw_user_meta_data ->> 'apple_review', '') = 'true'
      )
  );
$$;

COMMENT ON FUNCTION public.is_play_review_user(uuid) IS
  'True for Google Play / App Store review sandbox accounts that must stay out of production orgs.';

UPDATE public.organizations
SET is_sandbox = true
WHERE slug IN ('velbok-play-review', 'velbok-apple-review');

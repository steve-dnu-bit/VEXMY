-- Artist seat packages: Starter 3, Studio 4, Enterprise 10.
-- Enforces limits on invites and role assignment.

UPDATE public.subscription_plans SET
  max_artist_seats = 3,
  description = 'Small team — schedule, CRM, consent, customer portal (up to 3 artists).',
  updated_at = now()
WHERE id = 'starter';

UPDATE public.subscription_plans SET
  max_artist_seats = 4,
  description = 'Growing shop — full toolkit with deposits, inbox, stock (up to 4 artists).',
  updated_at = now()
WHERE id = 'studio';

UPDATE public.subscription_plans SET
  max_artist_seats = 10,
  description = 'Large studio — up to 10 artists, onboarding, SLA, and migration help.',
  updated_at = now()
WHERE id = 'enterprise';

-- Count distinct staff (admin + artist) linked to org, or all staff when single-tenant.
CREATE OR REPLACE FUNCTION public.org_artist_seat_count(_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT ur.user_id)::integer
  FROM public.user_roles ur
  WHERE ur.role IN ('admin', 'artist')
    AND (
      EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = _org_id AND om.user_id = ur.user_id
      )
      OR (SELECT COUNT(*) FROM public.organizations) = 1
    );
$$;

CREATE OR REPLACE FUNCTION public.org_can_add_artist_seat(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN sp.max_artist_seats IS NULL THEN true
        ELSE public.org_artist_seat_count(_org_id) < sp.max_artist_seats
      END
      FROM public.platform_subscriptions ps
      JOIN public.subscription_plans sp ON sp.id = ps.plan_id
      WHERE ps.organization_id = _org_id
        AND ps.status IN ('trialing', 'active', 'past_due')
      LIMIT 1
    ),
    true
  );
$$;

-- Seat usage for UI (used / max / can_add)
CREATE OR REPLACE FUNCTION public.get_org_seat_usage(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _used integer;
  _max integer;
  _plan_id text;
BEGIN
  _org_id := public.get_user_organization_id(_user_id);
  IF _org_id IS NULL AND (SELECT COUNT(*) FROM public.organizations) = 1 THEN
    SELECT id INTO _org_id FROM public.organizations LIMIT 1;
  END IF;

  IF _org_id IS NULL THEN
    RETURN jsonb_build_object('used', 0, 'max', null, 'can_add', true, 'plan_id', null);
  END IF;

  _used := public.org_artist_seat_count(_org_id);

  SELECT sp.max_artist_seats, sp.id
  INTO _max, _plan_id
  FROM public.platform_subscriptions ps
  JOIN public.subscription_plans sp ON sp.id = ps.plan_id
  WHERE ps.organization_id = _org_id
    AND ps.status IN ('trialing', 'active', 'past_due')
  LIMIT 1;

  RETURN jsonb_build_object(
    'used', _used,
    'max', _max,
    'can_add', public.org_can_add_artist_seat(_org_id),
    'plan_id', _plan_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_seat_usage(uuid) TO authenticated;

-- Block new artist/admin roles when plan seat cap is reached.
CREATE OR REPLACE FUNCTION public.enforce_artist_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _can_add boolean;
BEGIN
  IF NEW.role NOT IN ('admin', 'artist') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role IN ('admin', 'artist')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT om.organization_id INTO _org_id
  FROM public.organization_members om
  WHERE om.user_id = NEW.user_id
  LIMIT 1;

  IF _org_id IS NULL AND (SELECT COUNT(*) FROM public.organizations) = 1 THEN
    SELECT id INTO _org_id FROM public.organizations LIMIT 1;
  END IF;

  IF _org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT public.org_can_add_artist_seat(_org_id) INTO _can_add;
  IF NOT COALESCE(_can_add, true) THEN
    RAISE EXCEPTION 'artist_seat_limit_reached'
      USING HINT = 'Upgrade your plan to add more artist seats.',
            DETAIL = format('Organization %s is at its artist seat limit.', _org_id);
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (_org_id, NEW.user_id, 'member')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_artist_seat_limit_on_roles ON public.user_roles;
CREATE TRIGGER enforce_artist_seat_limit_on_roles
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_artist_seat_limit();

-- Link existing staff to the default org so seat counts are accurate.
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT o.id, ur.user_id, 'member'
FROM public.user_roles ur
CROSS JOIN LATERAL (
  SELECT id FROM public.organizations ORDER BY created_at LIMIT 1
) o
WHERE ur.role IN ('admin', 'artist')
ON CONFLICT (organization_id, user_id) DO NOTHING;

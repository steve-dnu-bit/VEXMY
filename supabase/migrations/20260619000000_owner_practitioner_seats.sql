-- Owner practitioner choice: admins who don't take bookings should not consume artist seats.

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS owner_is_practitioner boolean;

COMMENT ON COLUMN public.shop_settings.owner_is_practitioner IS
  'Whether the subscribing admin also takes bookings as an artist/piercer. NULL until shop setup asks.';

-- Artist seats = staff with the artist role only (admin-only owners do not count).
CREATE OR REPLACE FUNCTION public.org_artist_seat_count(_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT ur.user_id)::integer
  FROM public.user_roles ur
  WHERE ur.role = 'artist'
    AND (
      EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = _org_id AND om.user_id = ur.user_id
      )
      OR (SELECT COUNT(*) FROM public.organizations) = 1
    );
$$;

-- Only new artist roles consume seats; admin role alone does not.
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
  IF NEW.role <> 'artist' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role = 'artist'
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

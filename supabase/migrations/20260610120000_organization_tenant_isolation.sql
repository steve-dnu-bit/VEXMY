-- Multi-tenant isolation: scope bookings, staff RPCs, and customer org membership.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_organization ON public.bookings (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_multi_tenant_deployment()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT COUNT(*)::integer FROM public.organizations) > 1;
$$;

CREATE OR REPLACE FUNCTION public.resolve_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = _user_id
      ORDER BY
        CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        om.joined_at ASC
      LIMIT 1
    ),
    CASE
      WHEN (SELECT COUNT(*) FROM public.organizations) = 1 THEN
        (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1)
      ELSE NULL
    END
  );
$$;

CREATE OR REPLACE FUNCTION public.booking_in_caller_org(_org_id uuid, _artist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.is_multi_tenant_deployment() THEN true
    ELSE public.get_user_organization_id(auth.uid()) IS NOT NULL
      AND (
        (_org_id IS NOT NULL AND _org_id = public.get_user_organization_id(auth.uid()))
        OR (
          _org_id IS NULL
          AND public.resolve_user_organization_id(_artist_id) = public.get_user_organization_id(auth.uid())
        )
      )
  END;
$$;

-- Backfill booking org from assigned artist.
UPDATE public.bookings b
SET organization_id = public.resolve_user_organization_id(b.artist_id)
WHERE b.organization_id IS NULL
  AND public.resolve_user_organization_id(b.artist_id) IS NOT NULL;

-- Link customers to orgs via their bookings.
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT DISTINCT b.organization_id, b.client_user_id, 'member'::public.org_member_role
FROM public.bookings b
WHERE b.client_user_id IS NOT NULL
  AND b.organization_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Single-tenant: link all customers to the sole org.
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT o.id, ur.user_id, 'member'::public.org_member_role
FROM public.user_roles ur
CROSS JOIN LATERAL (
  SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1
) o
WHERE ur.role = 'customer'
  AND (SELECT COUNT(*) FROM public.organizations) = 1
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Bookings RLS: staff only see their organization's bookings in multi-tenant mode.
DROP POLICY IF EXISTS "Staff can view all bookings" ON public.bookings;
CREATE POLICY "Staff can view all bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_bookings(auth.uid())
    AND public.booking_in_caller_org(organization_id, artist_id)
  );

DROP POLICY IF EXISTS "Staff can insert bookings" ON public.bookings;
CREATE POLICY "Staff can insert bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_access_bookings(auth.uid())
    AND public.booking_in_caller_org(organization_id, artist_id)
  );

DROP POLICY IF EXISTS "Staff can update bookings" ON public.bookings;
CREATE POLICY "Staff can update bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    public.can_access_bookings(auth.uid())
    AND public.booking_in_caller_org(organization_id, artist_id)
  )
  WITH CHECK (
    public.can_access_bookings(auth.uid())
    AND public.booking_in_caller_org(organization_id, artist_id)
  );

DROP POLICY IF EXISTS "Staff can delete bookings" ON public.bookings;
CREATE POLICY "Staff can delete bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (
    public.can_access_bookings(auth.uid())
    AND public.booking_in_caller_org(organization_id, artist_id)
  );

CREATE OR REPLACE FUNCTION public._staff_booking_org_allowed(_org_id uuid, _artist_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_multi_tenant_deployment() THEN
    RETURN true;
  END IF;

  IF public.get_user_organization_id(auth.uid()) IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.booking_in_caller_org(_org_id, _artist_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_insert_booking(
  p_artist_id uuid,
  p_client_name text,
  p_client_phone text,
  p_client_email text,
  p_client_user_id uuid,
  p_tattoo_style text,
  p_tattoo_size text,
  p_tattoo_placement text,
  p_notes text,
  p_booking_type text,
  p_status text,
  p_deposit_paid boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_service_category text DEFAULT 'tattoo'
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bookings%ROWTYPE;
  v_cat text;
  v_org_id uuid;
BEGIN
  IF NOT public._staff_booking_caller_allowed() THEN
    RAISE EXCEPTION 'not allowed to create bookings';
  END IF;

  v_org_id := COALESCE(
    public.get_user_organization_id(auth.uid()),
    public.resolve_user_organization_id(p_artist_id)
  );

  IF NOT public._staff_booking_org_allowed(v_org_id, p_artist_id) THEN
    RAISE EXCEPTION 'artist not in your organization';
  END IF;

  v_cat := lower(trim(coalesce(p_service_category, '')));
  IF v_cat NOT IN ('tattoo', 'piercing', 'laser', 'consultation') THEN
    v_cat := 'tattoo';
  END IF;

  INSERT INTO public.bookings (
    artist_id,
    organization_id,
    client_name,
    client_phone,
    client_email,
    client_user_id,
    tattoo_style,
    tattoo_size,
    tattoo_placement,
    notes,
    booking_type,
    status,
    deposit_paid,
    starts_at,
    ends_at,
    service_category
  )
  VALUES (
    p_artist_id,
    v_org_id,
    p_client_name,
    NULLIF(trim(COALESCE(p_client_phone, '')), ''),
    NULLIF(trim(COALESCE(p_client_email, '')), ''),
    p_client_user_id,
    NULLIF(trim(COALESCE(p_tattoo_style, '')), ''),
    NULLIF(trim(COALESCE(p_tattoo_size, '')), ''),
    NULLIF(trim(COALESCE(p_tattoo_placement, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    COALESCE(NULLIF(trim(p_booking_type), ''), 'session'),
    COALESCE(NULLIF(trim(p_status), ''), 'confirmed'),
    COALESCE(p_deposit_paid, false),
    p_starts_at,
    p_ends_at,
    v_cat
  )
  RETURNING * INTO v_row;

  IF p_client_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, p_client_user_id, 'member'::public.org_member_role)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_update_booking(p_id uuid, p_patch jsonb)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bookings%ROWTYPE;
  v_existing public.bookings%ROWTYPE;
  v_cat text;
  v_artist_id uuid;
  v_org_id uuid;
  v_client_user_id uuid;
BEGIN
  IF NOT public._staff_booking_caller_allowed() THEN
    RAISE EXCEPTION 'not allowed to update bookings';
  END IF;

  SELECT * INTO v_existing FROM public.bookings WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  IF NOT public._staff_booking_org_allowed(v_existing.organization_id, v_existing.artist_id) THEN
    RAISE EXCEPTION 'booking not in your organization';
  END IF;

  v_artist_id := CASE
    WHEN p_patch ? 'artist_id' THEN (p_patch->>'artist_id')::uuid
    ELSE v_existing.artist_id
  END;

  IF NOT public._staff_booking_org_allowed(v_existing.organization_id, v_artist_id) THEN
    RAISE EXCEPTION 'artist not in your organization';
  END IF;

  v_org_id := COALESCE(v_existing.organization_id, public.resolve_user_organization_id(v_artist_id));

  UPDATE public.bookings b
  SET
    artist_id = v_artist_id,
    organization_id = v_org_id,
    client_name = CASE WHEN p_patch ? 'client_name' THEN p_patch->>'client_name' ELSE b.client_name END,
    client_phone = CASE
      WHEN p_patch ? 'client_phone' THEN NULLIF(trim(p_patch->>'client_phone'), '')
      ELSE b.client_phone
    END,
    client_email = CASE
      WHEN p_patch ? 'client_email' THEN NULLIF(lower(trim(p_patch->>'client_email')), '')
      ELSE b.client_email
    END,
    client_user_id = CASE
      WHEN p_patch ? 'client_user_id' THEN (NULLIF(p_patch->>'client_user_id', ''))::uuid
      ELSE b.client_user_id
    END,
    tattoo_style = CASE
      WHEN p_patch ? 'tattoo_style' THEN NULLIF(trim(p_patch->>'tattoo_style'), '')
      ELSE b.tattoo_style
    END,
    tattoo_size = CASE
      WHEN p_patch ? 'tattoo_size' THEN NULLIF(trim(p_patch->>'tattoo_size'), '')
      ELSE b.tattoo_size
    END,
    tattoo_placement = CASE
      WHEN p_patch ? 'tattoo_placement' THEN NULLIF(trim(p_patch->>'tattoo_placement'), '')
      ELSE b.tattoo_placement
    END,
    notes = CASE
      WHEN p_patch ? 'notes' THEN NULLIF(trim(p_patch->>'notes'), '')
      ELSE b.notes
    END,
    booking_type = CASE WHEN p_patch ? 'booking_type' THEN p_patch->>'booking_type' ELSE b.booking_type END,
    status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE b.status END,
    deposit_paid = CASE WHEN p_patch ? 'deposit_paid' THEN (p_patch->>'deposit_paid')::boolean ELSE b.deposit_paid END,
    starts_at = CASE WHEN p_patch ? 'starts_at' THEN (p_patch->>'starts_at')::timestamptz ELSE b.starts_at END,
    ends_at = CASE WHEN p_patch ? 'ends_at' THEN (p_patch->>'ends_at')::timestamptz ELSE b.ends_at END,
    service_category = CASE
      WHEN p_patch ? 'service_category' THEN
        CASE
          WHEN lower(trim(p_patch->>'service_category')) IN ('tattoo', 'piercing', 'laser', 'consultation')
          THEN lower(trim(p_patch->>'service_category'))
          ELSE b.service_category
        END
      ELSE b.service_category
    END
  WHERE b.id = p_id
  RETURNING * INTO v_row;

  v_client_user_id := v_row.client_user_id;
  IF v_client_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, v_client_user_id, 'member'::public.org_member_role)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_delete_booking(p_id uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bookings%ROWTYPE;
BEGIN
  IF NOT public._staff_booking_caller_allowed() THEN
    RAISE EXCEPTION 'not allowed to delete bookings';
  END IF;

  SELECT * INTO v_row FROM public.bookings WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  IF NOT public._staff_booking_org_allowed(v_row.organization_id, v_row.artist_id) THEN
    RAISE EXCEPTION 'booking not in your organization';
  END IF;

  DELETE FROM public.bookings b WHERE b.id = p_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_multi_tenant_deployment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_user_organization_id(uuid) TO authenticated;

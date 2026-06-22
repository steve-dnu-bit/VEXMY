-- Tighten artist privacy: resolve org for settings lookup, limit bypass, apply to writes.

CREATE OR REPLACE FUNCTION public.staff_bypasses_artist_data_privacy(_uid uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_org_admin(_org_id, _uid)
    OR (
      public.has_role(_uid, 'admin'::public.app_role)
      AND NOT public.has_role(_uid, 'artist'::public.app_role)
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.user_permissions up
        WHERE up.user_id = _uid
          AND up.granted = true
          AND up.feature IN ('schedule', 'deposits')
      )
      AND NOT public.has_role(_uid, 'artist'::public.app_role)
    );
$$;

CREATE OR REPLACE FUNCTION public.staff_can_view_booking(_uid uuid, _booking_artist_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT public.shop_artist_data_privacy_enabled(
      COALESCE(_org_id, public.get_user_organization_id(_uid))
    )
    OR public.staff_bypasses_artist_data_privacy(
      _uid,
      COALESCE(_org_id, public.get_user_organization_id(_uid))
    )
    OR _booking_artist_id = _uid;
$$;

CREATE OR REPLACE FUNCTION public.staff_can_view_imported_contact(
  _uid uuid,
  _org_id uuid,
  _created_by uuid,
  _name text,
  _email text,
  _phone text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT public.shop_artist_data_privacy_enabled(
      COALESCE(_org_id, public.get_user_organization_id(_uid))
    )
    OR public.staff_bypasses_artist_data_privacy(
      _uid,
      COALESCE(_org_id, public.get_user_organization_id(_uid))
    )
    OR _created_by = _uid
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.organization_id = COALESCE(_org_id, public.get_user_organization_id(_uid))
        AND b.artist_id = _uid
        AND (
          (
            _email IS NOT NULL
            AND trim(_email) <> ''
            AND b.client_email IS NOT NULL
            AND lower(trim(_email)) = lower(trim(b.client_email))
          )
          OR (
            _phone IS NOT NULL
            AND trim(_phone) <> ''
            AND b.client_phone IS NOT NULL
            AND regexp_replace(_phone, '\s', '', 'g') = regexp_replace(b.client_phone, '\s', '', 'g')
          )
          OR lower(trim(coalesce(_name, ''))) = lower(trim(b.client_name))
        )
    );
$$;

DROP POLICY IF EXISTS "Staff can update bookings" ON public.bookings;
CREATE POLICY "Staff can update bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    public.can_access_bookings(auth.uid())
    AND public.booking_in_caller_org(organization_id, artist_id)
    AND public.staff_can_view_booking(auth.uid(), artist_id, organization_id)
  )
  WITH CHECK (
    public.can_access_bookings(auth.uid())
    AND public.booking_in_caller_org(organization_id, artist_id)
    AND public.staff_can_view_booking(auth.uid(), artist_id, organization_id)
  );

DROP POLICY IF EXISTS "Staff can delete bookings" ON public.bookings;
CREATE POLICY "Staff can delete bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (
    public.can_access_bookings(auth.uid())
    AND public.booking_in_caller_org(organization_id, artist_id)
    AND public.staff_can_view_booking(auth.uid(), artist_id, organization_id)
  );

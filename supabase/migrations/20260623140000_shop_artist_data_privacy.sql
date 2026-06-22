-- Shop setting: artists only see their own bookings and linked clients (admins see all).

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS artist_data_privacy boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shop_settings.artist_data_privacy IS
  'When true, artists only see their own bookings and clients. Shop/org admins and app admins still see everything.';

CREATE OR REPLACE FUNCTION public.shop_artist_data_privacy_enabled(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ss.artist_data_privacy FROM public.shop_settings ss WHERE ss.organization_id = _org_id LIMIT 1),
    false
  );
$$;

-- Front desk (schedule/deposits without artist role), app admins, and org admins bypass privacy.
CREATE OR REPLACE FUNCTION public.staff_bypasses_artist_data_privacy(_uid uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.is_org_admin(_org_id, _uid)
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
    NOT public.shop_artist_data_privacy_enabled(_org_id)
    OR public.staff_bypasses_artist_data_privacy(_uid, _org_id)
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
    NOT public.shop_artist_data_privacy_enabled(_org_id)
    OR public.staff_bypasses_artist_data_privacy(_uid, _org_id)
    OR _created_by = _uid
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.organization_id = _org_id
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

DROP POLICY IF EXISTS "Staff can view all bookings" ON public.bookings;
CREATE POLICY "Staff can view all bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_bookings(auth.uid())
    AND public.booking_in_caller_org(organization_id, artist_id)
    AND public.staff_can_view_booking(auth.uid(), artist_id, organization_id)
  );

DROP POLICY IF EXISTS "Org members can view imported contacts" ON public.contacts_import;
CREATE POLICY "Org members can view imported contacts"
  ON public.contacts_import FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND public.staff_can_view_imported_contact(
      auth.uid(),
      organization_id,
      created_by,
      name,
      email,
      phone
    )
  );

GRANT EXECUTE ON FUNCTION public.shop_artist_data_privacy_enabled(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_bypasses_artist_data_privacy(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_can_view_booking(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_can_view_imported_contact(uuid, uuid, uuid, text, text, text) TO authenticated;

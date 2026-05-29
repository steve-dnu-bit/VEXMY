-- Booking INSERT/UPDATE/DELETE: some staff accounts can read the schedule under legacy
-- role rules but lack `user_permissions` rows (or `schedule` not granted). Align writes
-- with the older "staff vs customer-only" idea so they can still create rows for any artist.

CREATE OR REPLACE FUNCTION public.bookings_write_allowed(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_permission(_uid, 'schedule')
    OR public.has_permission(_uid, 'deposits')
    OR public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'artist'::public.app_role)
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = _uid AND ur.role = 'customer'::public.app_role
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = _uid
          AND ur.role IN (
            'admin'::public.app_role,
            'artist'::public.app_role,
            'assistant'::public.app_role
          )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.bookings_write_allowed(uuid) TO authenticated;

DROP POLICY IF EXISTS "Staff can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff can delete bookings" ON public.bookings;

CREATE POLICY "Staff can insert bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.bookings_write_allowed(auth.uid()));

CREATE POLICY "Staff can update bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (public.bookings_write_allowed(auth.uid()))
  WITH CHECK (public.bookings_write_allowed(auth.uid()));

CREATE POLICY "Staff can delete bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (public.bookings_write_allowed(auth.uid()));

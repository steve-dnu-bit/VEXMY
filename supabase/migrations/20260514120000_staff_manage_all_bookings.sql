-- Allow any schedule staff (artists, admins, schedule/deposits permission) to create,
-- update, or delete bookings for any artist — not only rows where artist_id = auth.uid().

DROP POLICY IF EXISTS "Artists can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Artists can update own bookings" ON public.bookings;

CREATE POLICY "Staff can insert bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  );

CREATE POLICY "Staff can update bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  );

CREATE POLICY "Staff can delete bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  );

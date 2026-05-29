-- Fix schedule visibility when role rows are missing/stale.
-- Use feature permission as the primary gate for staff schedule access.

DROP POLICY IF EXISTS "Staff can view all bookings" ON public.bookings;

CREATE POLICY "Staff can view all bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
    OR public.has_role(auth.uid(), 'assistant'::public.app_role)
  );

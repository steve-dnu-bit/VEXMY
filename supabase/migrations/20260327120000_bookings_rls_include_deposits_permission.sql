-- Deposits page loads bookings; staff may have "deposits" without "schedule".
-- Extend SELECT policy so users with deposits permission can read bookings (same as schedule gate).

DROP POLICY IF EXISTS "Staff can view all bookings" ON public.bookings;

CREATE POLICY "Staff can view all bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
    OR public.has_role(auth.uid(), 'assistant'::public.app_role)
  );

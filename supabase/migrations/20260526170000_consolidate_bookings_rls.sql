-- Consolidate the 4 separate has_permission/has_role subqueries in bookings RLS
-- into a single cached SECURITY DEFINER function. This reduces per-row cost from
-- 4+ subqueries to a single function call that Postgres can inline/cache.

CREATE OR REPLACE FUNCTION public.can_access_bookings(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _uid
      AND ur.role IN ('admin'::public.app_role, 'artist'::public.app_role)
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = _uid
      AND up.feature IN ('schedule', 'deposits')
      AND up.granted = true
  );
$$;

-- Drop all existing booking policies
DO $$
DECLARE pol text;
BEGIN
  FOR pol IN
    SELECT p.polname
    FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'bookings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.bookings', pol);
  END LOOP;
END $$;

-- Recreate with single function call per row
CREATE POLICY "Staff can view all bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (public.can_access_bookings(auth.uid()));

CREATE POLICY "Customers can view own bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'customer'::public.app_role
    )
    AND (
      client_user_id = auth.uid()
      OR (
        COALESCE(NULLIF(trim(client_email), ''), NULL) IS NOT NULL
        AND lower(trim(client_email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
      )
    )
  );

CREATE POLICY "Staff can insert bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_bookings(auth.uid()));

CREATE POLICY "Staff can update bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (public.can_access_bookings(auth.uid()))
  WITH CHECK (public.can_access_bookings(auth.uid()));

CREATE POLICY "Staff can delete bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (public.can_access_bookings(auth.uid()));

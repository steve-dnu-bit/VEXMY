-- Full reset of public.bookings RLS: drop every policy on the table, then recreate the
-- intended set only. Write policies use the SAME predicate as staff SELECT so anyone who
-- can load the schedule can insert/update/delete for any artist_id.

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

DROP FUNCTION IF EXISTS public.bookings_write_allowed(uuid);

-- Match supabase/migrations/20260429200500_unify_assistant_into_artist.sql staff SELECT.
CREATE POLICY "Staff can view all bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  );

-- Customer portal: own rows only (from 20260318200000_customer_invites_defaults.sql).
CREATE POLICY "Customers can view own bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
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

CREATE POLICY "Admins can manage all bookings"
  ON public.bookings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;

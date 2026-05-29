-- Unify "assistant" users into "artist" role.
-- 1) Migrate existing assistant role rows to artist.
-- 2) Remove assistant rows.
-- 3) Update policy checks to use admin/artist only.

INSERT INTO public.user_roles (user_id, role)
SELECT ur.user_id, 'artist'::public.app_role
FROM public.user_roles ur
WHERE ur.role = 'assistant'::public.app_role
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles
WHERE role = 'assistant'::public.app_role;

-- bookings: staff read policy
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
  );

-- consent signatures policies
DROP POLICY IF EXISTS "consent_insert_authenticated_own" ON public.consent_signatures;
CREATE POLICY "consent_insert_authenticated_own"
  ON public.consent_signatures FOR INSERT
  TO authenticated
  WITH CHECK (
    booking_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = consent_signatures.booking_id
          AND (
            b.client_user_id = auth.uid()
            OR (
              b.client_email IS NOT NULL
              AND lower(trim(b.client_email)) = lower(trim(auth.jwt() ->> 'email'))
            )
          )
      )
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "consent_select_authenticated" ON public.consent_signatures;
CREATE POLICY "consent_select_authenticated"
  ON public.consent_signatures FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
    OR (
      booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = consent_signatures.booking_id
          AND (
            b.client_user_id = auth.uid()
            OR (
              b.client_email IS NOT NULL
              AND lower(trim(b.client_email)) = lower(trim(auth.jwt() ->> 'email'))
            )
          )
      )
    )
  );

-- client conduct policies
DROP POLICY IF EXISTS "Staff can read client conduct" ON public.client_conduct;
CREATE POLICY "Staff can read client conduct"
  ON public.client_conduct
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  );

DROP POLICY IF EXISTS "Staff can insert client conduct" ON public.client_conduct;
CREATE POLICY "Staff can insert client conduct"
  ON public.client_conduct
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  );

DROP POLICY IF EXISTS "Staff can update client conduct" ON public.client_conduct;
CREATE POLICY "Staff can update client conduct"
  ON public.client_conduct
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

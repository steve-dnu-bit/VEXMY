-- Bookings INSERT/UPDATE/DELETE: evaluate staff eligibility inline (invoker), not via
-- SECURITY DEFINER helper, so RLS matches what the same user can read on user_permissions / user_roles.

DROP POLICY IF EXISTS "Staff can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff can delete bookings" ON public.bookings;

DROP FUNCTION IF EXISTS public.bookings_write_allowed(uuid);

CREATE POLICY "Staff can insert bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.granted = true
        AND up.feature IN (
          'schedule', 'inbox', 'services', 'stencil', 'clients', 'stock',
          'dashboard', 'settings', 'deposits', 'billing', 'admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN (
          'admin'::public.app_role,
          'artist'::public.app_role,
          'assistant'::public.app_role
        )
    )
    OR (
      NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'customer'::public.app_role
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN (
            'admin'::public.app_role,
            'artist'::public.app_role,
            'assistant'::public.app_role
          )
      )
    )
  );

CREATE POLICY "Staff can update bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.granted = true
        AND up.feature IN (
          'schedule', 'inbox', 'services', 'stencil', 'clients', 'stock',
          'dashboard', 'settings', 'deposits', 'billing', 'admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN (
          'admin'::public.app_role,
          'artist'::public.app_role,
          'assistant'::public.app_role
        )
    )
    OR (
      NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'customer'::public.app_role
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN (
            'admin'::public.app_role,
            'artist'::public.app_role,
            'assistant'::public.app_role
          )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.granted = true
        AND up.feature IN (
          'schedule', 'inbox', 'services', 'stencil', 'clients', 'stock',
          'dashboard', 'settings', 'deposits', 'billing', 'admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN (
          'admin'::public.app_role,
          'artist'::public.app_role,
          'assistant'::public.app_role
        )
    )
    OR (
      NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'customer'::public.app_role
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN (
            'admin'::public.app_role,
            'artist'::public.app_role,
            'assistant'::public.app_role
          )
      )
    )
  );

CREATE POLICY "Staff can delete bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.granted = true
        AND up.feature IN (
          'schedule', 'inbox', 'services', 'stencil', 'clients', 'stock',
          'dashboard', 'settings', 'deposits', 'billing', 'admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN (
          'admin'::public.app_role,
          'artist'::public.app_role,
          'assistant'::public.app_role
        )
    )
    OR (
      NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'customer'::public.app_role
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN (
            'admin'::public.app_role,
            'artist'::public.app_role,
            'assistant'::public.app_role
          )
      )
    )
  );

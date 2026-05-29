-- bookings_write_allowed: use direct EXISTS on user_permissions / user_roles instead of
-- has_permission / has_role only, so any granted staff-area feature (e.g. schedule) is
-- honoured even if helper functions behave differently per owner/search_path.
-- Also treat any granted staff feature (inbox, services, …) as sufficient to manage bookings.

CREATE OR REPLACE FUNCTION public.bookings_write_allowed(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.user_id = _uid
        AND up.granted = true
        AND up.feature IN (
          'schedule', 'inbox', 'services', 'stencil', 'clients', 'stock',
          'dashboard', 'settings', 'deposits', 'billing', 'admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _uid
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
        WHERE ur.user_id = _uid AND ur.role = 'customer'::public.app_role
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
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

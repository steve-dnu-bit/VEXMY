-- Allow studio admins with the admin permission (not only user_roles.admin) to manage reminder settings.

CREATE OR REPLACE FUNCTION public.can_manage_shop_reminder_settings()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'admin');
$$;

DROP POLICY IF EXISTS "Admins can view shop reminder settings" ON public.reminder_settings;
CREATE POLICY "Admins can view shop reminder settings"
ON public.reminder_settings
FOR SELECT TO authenticated
USING (public.can_manage_shop_reminder_settings());

DROP POLICY IF EXISTS "Admins can insert shop reminder settings" ON public.reminder_settings;
CREATE POLICY "Admins can insert shop reminder settings"
ON public.reminder_settings
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_shop_reminder_settings());

DROP POLICY IF EXISTS "Admins can update shop reminder settings" ON public.reminder_settings;
CREATE POLICY "Admins can update shop reminder settings"
ON public.reminder_settings
FOR UPDATE TO authenticated
USING (public.can_manage_shop_reminder_settings())
WITH CHECK (public.can_manage_shop_reminder_settings());

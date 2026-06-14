-- Platform operators can manage shop permission rows (same as shop admin role).
DROP POLICY IF EXISTS "Platform admins can manage permissions" ON public.user_permissions;
CREATE POLICY "Platform admins can manage permissions"
  ON public.user_permissions
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Allow app admins (user_roles / admin permission) who belong to an org to manage shop settings.

DROP POLICY IF EXISTS "Org admins manage shop settings" ON public.shop_settings;

CREATE POLICY "Org admins manage shop settings"
  ON public.shop_settings FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      organization_id IS NOT NULL
      AND public.is_org_admin(organization_id, auth.uid())
    )
    OR (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id, auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_permission(auth.uid(), 'admin')
      )
    )
    OR (
      organization_id IS NULL
      AND public.has_role(auth.uid(), 'admin')
    )
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR (
      organization_id IS NOT NULL
      AND public.is_org_admin(organization_id, auth.uid())
    )
    OR (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id, auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_permission(auth.uid(), 'admin')
      )
    )
    OR (
      organization_id IS NULL
      AND public.has_role(auth.uid(), 'admin')
    )
  );

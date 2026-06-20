-- Allow studio app admins (user_roles.admin) to manage artist POS splits, not only org_members admins.

DROP POLICY IF EXISTS "Org admins can manage artist POS splits" ON public.artist_pos_splits;
CREATE POLICY "Org admins can manage artist POS splits"
  ON public.artist_pos_splits FOR ALL TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Play Store / production security hardening: org-scoped RLS, private uploads bucket.

-- ---------------------------------------------------------------------------
-- shop_settings: scope SELECT to org members (not all authenticated users)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view shop settings" ON public.shop_settings;

CREATE POLICY "Org members view shop settings"
  ON public.shop_settings FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id, auth.uid())
    )
    OR organization_id IS NULL
  );

DROP POLICY IF EXISTS "Admins can manage shop settings" ON public.shop_settings;

CREATE POLICY "Org admins manage shop settings"
  ON public.shop_settings FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      organization_id IS NOT NULL
      AND public.is_org_admin(organization_id, auth.uid())
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
      organization_id IS NULL
      AND public.has_role(auth.uid(), 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- channel_connections: remove global admin override; scope to org membership
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage all connections" ON public.channel_connections;

DROP POLICY IF EXISTS "Users can view own connections" ON public.channel_connections;
CREATE POLICY "Org members view channel connections"
  ON public.channel_connections FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      organization_id IS NOT NULL
      AND public.is_org_member(organization_id, auth.uid())
    )
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can insert own connections" ON public.channel_connections;
CREATE POLICY "Org members insert channel connections"
  ON public.channel_connections FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      public.is_platform_admin(auth.uid())
      OR (
        organization_id IS NOT NULL
        AND public.is_org_member(organization_id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Users can update own connections" ON public.channel_connections;
CREATE POLICY "Org members update channel connections"
  ON public.channel_connections FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND (
      public.is_platform_admin(auth.uid())
      OR (
        organization_id IS NOT NULL
        AND public.is_org_member(organization_id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete own connections" ON public.channel_connections;
CREATE POLICY "Org members delete channel connections"
  ON public.channel_connections FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (
      public.is_platform_admin(auth.uid())
      OR (
        organization_id IS NOT NULL
        AND public.is_org_member(organization_id, auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- uploads storage: private bucket; authenticated access (not world-readable)
-- ---------------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'uploads';

DROP POLICY IF EXISTS "Anyone can view uploads" ON storage.objects;

CREATE POLICY "Authenticated users view uploads bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'uploads');

-- Marketing avatars/logos on public consent pages (read-only, no listing)
CREATE POLICY "Public read studio branding assets"
  ON storage.objects FOR SELECT TO anon
  USING (
    bucket_id = 'uploads'
    AND (
      name LIKE 'avatars/%'
      OR name LIKE 'shop_logos/%'
    )
  );

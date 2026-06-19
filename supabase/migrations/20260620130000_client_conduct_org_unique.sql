-- Scope client conduct per organization; fix upsert ON CONFLICT (organization_id, client_key).

ALTER TABLE public.client_conduct
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill from matching bookings (most recent first).
UPDATE public.client_conduct cc
SET organization_id = b.organization_id
FROM (
  SELECT DISTINCT ON (cc2.id) cc2.id AS conduct_id, b.organization_id
  FROM public.client_conduct cc2
  JOIN public.bookings b ON b.organization_id IS NOT NULL
    AND (
      (cc2.client_user_id IS NOT NULL AND b.client_user_id = cc2.client_user_id)
      OR (
        cc2.client_email IS NOT NULL
        AND b.client_email IS NOT NULL
        AND lower(trim(b.client_email)) = cc2.client_email
      )
      OR (
        cc2.client_phone IS NOT NULL
        AND b.client_phone IS NOT NULL
        AND regexp_replace(b.client_phone, '\s', '', 'g') = cc2.client_phone
      )
    )
  WHERE cc2.organization_id IS NULL
  ORDER BY cc2.id, b.starts_at DESC NULLS LAST
) b
WHERE cc.id = b.conduct_id
  AND cc.organization_id IS NULL;

UPDATE public.client_conduct cc
SET organization_id = public.resolve_user_organization_id(cc.updated_by)
WHERE cc.organization_id IS NULL
  AND cc.updated_by IS NOT NULL;

UPDATE public.client_conduct cc
SET organization_id = (
  SELECT o.id FROM public.organizations o ORDER BY o.created_at ASC LIMIT 1
)
WHERE cc.organization_id IS NULL
  AND (SELECT COUNT(*)::integer FROM public.organizations) = 1;

-- Keep one row per org + client_key before adding the unique index.
DELETE FROM public.client_conduct a
USING public.client_conduct b
WHERE a.organization_id IS NOT DISTINCT FROM b.organization_id
  AND a.client_key = b.client_key
  AND a.id < b.id;

ALTER TABLE public.client_conduct
  DROP CONSTRAINT IF EXISTS client_conduct_client_key_key;

ALTER TABLE public.client_conduct
  DROP CONSTRAINT IF EXISTS client_conduct_organization_id_client_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS client_conduct_organization_id_client_key_key
  ON public.client_conduct (organization_id, client_key);

CREATE INDEX IF NOT EXISTS client_conduct_organization_id_idx
  ON public.client_conduct (organization_id);

-- Org-scoped staff policies (multi-tenant).
DROP POLICY IF EXISTS "Staff can read client conduct" ON public.client_conduct;
CREATE POLICY "Staff can read client conduct"
  ON public.client_conduct
  FOR SELECT
  TO authenticated
  USING (
    (
      public.has_permission(auth.uid(), 'schedule')
      OR public.has_permission(auth.uid(), 'deposits')
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
    )
    AND (
      public.is_platform_admin(auth.uid())
      OR NOT public.is_multi_tenant_deployment()
      OR organization_id IS NULL
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff can insert client conduct" ON public.client_conduct;
CREATE POLICY "Staff can insert client conduct"
  ON public.client_conduct
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      public.has_permission(auth.uid(), 'schedule')
      OR public.has_permission(auth.uid(), 'deposits')
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
    )
    AND (
      public.is_platform_admin(auth.uid())
      OR NOT public.is_multi_tenant_deployment()
      OR organization_id IS NULL
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff can update client conduct" ON public.client_conduct;
CREATE POLICY "Staff can update client conduct"
  ON public.client_conduct
  FOR UPDATE
  TO authenticated
  USING (
    (
      public.has_permission(auth.uid(), 'schedule')
      OR public.has_permission(auth.uid(), 'deposits')
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
    )
    AND (
      public.is_platform_admin(auth.uid())
      OR NOT public.is_multi_tenant_deployment()
      OR organization_id IS NULL
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  )
  WITH CHECK (
    (
      public.has_permission(auth.uid(), 'schedule')
      OR public.has_permission(auth.uid(), 'deposits')
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
    )
    AND (
      public.is_platform_admin(auth.uid())
      OR NOT public.is_multi_tenant_deployment()
      OR organization_id IS NULL
      OR organization_id = public.get_user_organization_id(auth.uid())
    )
  );

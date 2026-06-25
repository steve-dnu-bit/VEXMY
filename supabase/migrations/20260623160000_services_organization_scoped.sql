-- Scope studio services per organization with five defaults for each new studio.

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS services_organization_sort_idx
  ON public.services (organization_id, sort_order);

-- Link existing user-created services to the member's organization.
UPDATE public.services s
SET organization_id = public.get_user_organization_id(s.created_by)
WHERE s.organization_id IS NULL
  AND s.created_by IS NOT NULL
  AND s.created_by <> '00000000-0000-0000-0000-000000000000'::uuid
  AND public.get_user_organization_id(s.created_by) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_default_org_services(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
BEGIN
  IF _org_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.services WHERE organization_id = _org_id LIMIT 1) THEN
    RETURN;
  END IF;

  SELECT o.owner_user_id INTO owner_id
  FROM public.organizations o
  WHERE o.id = _org_id;

  IF owner_id IS NULL THEN
    SELECT om.user_id INTO owner_id
    FROM public.organization_members om
    WHERE om.organization_id = _org_id
      AND om.role = 'owner'
    ORDER BY om.joined_at
    LIMIT 1;
  END IF;

  IF owner_id IS NULL THEN
    owner_id := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  INSERT INTO public.services (
    organization_id,
    name,
    duration,
    booking_type,
    service_category,
    color,
    sort_order,
    created_by,
    deposit_required,
    deposit_amount,
    is_active
  ) VALUES
    (_org_id, 'Consultation', 30, 'consultation', 'consultation', 'blue', 0, owner_id, false, NULL, true),
    (_org_id, 'Small Tattoo', 60, 'session', 'tattoo', 'amber', 1, owner_id, false, NULL, true),
    (_org_id, 'Medium Tattoo', 120, 'session', 'tattoo', 'gold', 2, owner_id, false, NULL, true),
    (_org_id, 'Large Tattoo', 240, 'session', 'tattoo', 'red', 3, owner_id, false, NULL, true),
    (_org_id, 'Touch-up', 60, 'touch-up', 'tattoo', 'emerald', 4, owner_id, false, NULL, true);
END;
$$;

-- Seed defaults for every organization that still has no services.
DO $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN SELECT id FROM public.organizations LOOP
    PERFORM public.ensure_default_org_services(org_record.id);
  END LOOP;
END $$;

DELETE FROM public.services WHERE organization_id IS NULL;

ALTER TABLE public.services
  ALTER COLUMN organization_id SET NOT NULL;

-- Auto-seed when a new organization is created.
CREATE OR REPLACE FUNCTION public.trg_organizations_seed_services()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_default_org_services(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_seed_services ON public.organizations;
CREATE TRIGGER organizations_seed_services
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_organizations_seed_services();

-- RLS: services are visible and manageable only within the member's organization.
DROP POLICY IF EXISTS "Staff can view all services" ON public.services;
DROP POLICY IF EXISTS "Admins can manage services" ON public.services;
DROP POLICY IF EXISTS "Artists can insert services" ON public.services;
DROP POLICY IF EXISTS "Artists can update own services" ON public.services;
DROP POLICY IF EXISTS "Artists can delete own services" ON public.services;

CREATE POLICY "Org staff can view services"
  ON public.services FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Org staff can insert services"
  ON public.services FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'services')
    )
    AND organization_id = public.get_user_organization_id(auth.uid())
  );

CREATE POLICY "Org staff can update services"
  ON public.services FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'services')
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id)
    AND organization_id = public.get_user_organization_id(auth.uid())
  );

CREATE POLICY "Org staff can delete services"
  ON public.services FOR DELETE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'services')
    )
  );

GRANT EXECUTE ON FUNCTION public.ensure_default_org_services(uuid) TO authenticated, service_role;

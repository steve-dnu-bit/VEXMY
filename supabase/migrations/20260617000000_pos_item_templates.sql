-- Reusable quick-add items for POS checkout (sorted by usage)

CREATE TABLE IF NOT EXISTS public.pos_item_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit_price numeric(12, 2) NOT NULL DEFAULT 0,
  default_quantity integer NOT NULL DEFAULT 1 CHECK (default_quantity >= 1),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS pos_item_templates_org_usage_idx
  ON public.pos_item_templates (organization_id, use_count DESC, name);

ALTER TABLE public.pos_item_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org staff can view POS item templates" ON public.pos_item_templates;
CREATE POLICY "Org staff can view POS item templates"
  ON public.pos_item_templates FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
      OR public.has_permission(auth.uid(), 'checkout')
    )
  );

DROP POLICY IF EXISTS "Org staff can manage POS item templates" ON public.pos_item_templates;
CREATE POLICY "Org staff can manage POS item templates"
  ON public.pos_item_templates FOR ALL TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
      OR public.has_permission(auth.uid(), 'checkout')
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
      OR public.has_permission(auth.uid(), 'checkout')
    )
  );

CREATE OR REPLACE FUNCTION public.bump_pos_item_template_usage(
  p_org_id uuid,
  p_name text,
  p_unit_price numeric,
  p_default_quantity integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := trim(p_name);
BEGIN
  IF v_name IS NULL OR v_name = '' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL OR NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized for organization';
  END IF;

  IF NOT (
    public.is_org_admin(p_org_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
    OR public.has_permission(auth.uid(), 'billing')
    OR public.has_permission(auth.uid(), 'checkout')
  ) THEN
    RAISE EXCEPTION 'Not authorized for organization';
  END IF;

  INSERT INTO public.pos_item_templates (
    organization_id,
    name,
    unit_price,
    default_quantity,
    use_count,
    last_used_at
  )
  VALUES (
    p_org_id,
    v_name,
    COALESCE(p_unit_price, 0),
    GREATEST(1, COALESCE(p_default_quantity, 1)),
    1,
    now()
  )
  ON CONFLICT (organization_id, name) DO UPDATE SET
    unit_price = EXCLUDED.unit_price,
    default_quantity = EXCLUDED.default_quantity,
    use_count = public.pos_item_templates.use_count + 1,
    last_used_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.bump_pos_item_template_usage(uuid, text, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_pos_item_template_usage(uuid, text, numeric, integer) TO authenticated;

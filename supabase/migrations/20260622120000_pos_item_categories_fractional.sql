-- POS item categories and fractional default quantities

ALTER TABLE public.pos_item_templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General';

CREATE INDEX IF NOT EXISTS pos_item_templates_org_category_idx
  ON public.pos_item_templates (organization_id, category, use_count DESC, name);

ALTER TABLE public.pos_item_templates
  DROP CONSTRAINT IF EXISTS pos_item_templates_default_quantity_check;

ALTER TABLE public.pos_item_templates
  ALTER COLUMN default_quantity TYPE numeric(10, 2) USING default_quantity::numeric(10, 2);

ALTER TABLE public.pos_item_templates
  ADD CONSTRAINT pos_item_templates_default_quantity_check CHECK (default_quantity > 0);

CREATE OR REPLACE FUNCTION public.bump_pos_item_template_usage(
  p_org_id uuid,
  p_name text,
  p_unit_price numeric,
  p_default_quantity numeric DEFAULT 1
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
    GREATEST(0.01, COALESCE(p_default_quantity, 1)),
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

REVOKE ALL ON FUNCTION public.bump_pos_item_template_usage(uuid, text, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_pos_item_template_usage(uuid, text, numeric, numeric) TO authenticated;

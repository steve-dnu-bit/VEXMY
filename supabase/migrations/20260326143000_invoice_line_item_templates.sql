-- Reusable line items for invoice creation
CREATE TABLE IF NOT EXISTS public.invoice_line_item_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  description text NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  default_quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, description)
);

ALTER TABLE public.invoice_line_item_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own line item templates" ON public.invoice_line_item_templates;
CREATE POLICY "Users can view own line item templates"
  ON public.invoice_line_item_templates
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users can insert own line item templates" ON public.invoice_line_item_templates;
CREATE POLICY "Users can insert own line item templates"
  ON public.invoice_line_item_templates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users can update own line item templates" ON public.invoice_line_item_templates;
CREATE POLICY "Users can update own line item templates"
  ON public.invoice_line_item_templates
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::public.app_role));


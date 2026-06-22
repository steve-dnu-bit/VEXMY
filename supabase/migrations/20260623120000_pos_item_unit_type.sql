-- Hourly vs per-unit pricing for POS quick items (e.g. €110/hr × 4.5 hours).

ALTER TABLE public.pos_item_templates
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'each';

ALTER TABLE public.pos_item_templates
  DROP CONSTRAINT IF EXISTS pos_item_templates_unit_type_check;

ALTER TABLE public.pos_item_templates
  ADD CONSTRAINT pos_item_templates_unit_type_check CHECK (unit_type IN ('each', 'hour'));

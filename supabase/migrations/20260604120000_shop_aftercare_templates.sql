-- Per-organization aftercare email templates (tattoo / piercing), seeded from built-in defaults.

CREATE TABLE IF NOT EXISTS public.shop_aftercare_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('tattoo', 'piercing')),
  enabled boolean NOT NULL DEFAULT true,
  badge text NOT NULL,
  title text NOT NULL,
  email_subject text NOT NULL,
  intro_template text NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_aftercare_templates_org_kind_unique UNIQUE (organization_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_shop_aftercare_templates_org
  ON public.shop_aftercare_templates (organization_id);

ALTER TABLE public.shop_aftercare_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view shop aftercare templates"
ON public.shop_aftercare_templates
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert shop aftercare templates"
ON public.shop_aftercare_templates
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update shop aftercare templates"
ON public.shop_aftercare_templates
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Service role can manage shop aftercare templates"
ON public.shop_aftercare_templates
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_shop_aftercare_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_aftercare_templates_updated_at ON public.shop_aftercare_templates;
CREATE TRIGGER shop_aftercare_templates_updated_at
  BEFORE UPDATE ON public.shop_aftercare_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_shop_aftercare_templates_updated_at();

-- Resolve org for aftercare (member org or single-tenant fallback).
CREATE OR REPLACE FUNCTION public.aftercare_org_for_deployment()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1),
    NULL
  );
$$;

-- Seed tattoo + piercing defaults for every organization (matches src/lib/defaultAftercareTemplates.ts).
DO $$
DECLARE
  org_row RECORD;
  tattoo_sections jsonb := '[
    {"title":"Important guidelines","listItems":["Wash hands thoroughly before touching your tattoo.","Do not pick or scratch scabs; this can cause color loss and patchy healing.","Do not soak in the bath and avoid swimming until fully healed.","Avoid direct contact with pets. If pets sleep in bed, use fresh sheets and keep animals out during healing.","Use only a very small amount of cream. The tattoo should be moisturized, not shiny or greasy."]},
    {"title":"Aftercare routine","orderedList":true,"listItems":["Wash your hands thoroughly.","Remove cling film after 2-4 hours, or as soon as it is safe in a clean place with clean water and soap.","Wash gently with lukewarm water. If you have a hot water tank (not a combi boiler), use cool/cold water instead.","Do not apply numbing cream, alcohol, natural oils, or homemade remedies.","Use mild soap (Dove or similar). No antibacterial soap, shower gel, shampoo, or sponges.","Rinse thoroughly and pat dry with clean paper towel only. Do not use toilet paper.","After the first wash, do not apply any cream. Leave the tattoo clean and dry.","The following morning, wash your hands, wash the tattoo again, and pat dry.","Continue washing twice daily, morning and evening. If needed, wash one extra time, but not more than 3 times per day.","After each wash, leave it to air dry for 5 minutes, then apply a tiny amount of aftercare cream/Bepanthen.","Continue this routine for around 14 days.","For the first 3 days, it is safer to keep the tattoo on the drier side rather than over-moisturizing."]},
    {"title":"Tissue corner test","listItems":["Place a tiny clean tissue corner on the tattoo.","If it sticks, you used too much cream.","If it falls off, the amount is correct."]},
    {"title":"Signs of infection","bodyHtml":"<p style=\"margin:0 0 8px;font-size:13px;line-height:1.65;color:#e8e8e8;\">Signs of infection may include redness, swelling, and pain. This does not mean a little normal irritation, but severe or worsening symptoms.</p><p style=\"margin:0;font-size:13px;line-height:1.65;color:#e8e8e8;\">In case of emergency, please seek immediate medical advice or go to A&amp;E.</p>"}
  ]'::jsonb;
  piercing_sections jsonb := '[
    {"title":"Daily cleaning","listItems":["Clean hands first. Always wash your hands thoroughly before touching or cleaning your piercing.","Clean the piercing daily. Discharge, pus, and granulomas can form within 2 days and may become infected very quickly if the piercing is not kept clean.","Use sterile saline solution only. Avoid alcohol, hydrogen peroxide, harsh chemicals, oils, creams, and homemade remedies.","Soak clean paper towel or sterile gauze with saline and gently clean around the piercing. Do not twist or play with the jewellery.","Rinse with warm water after cleaning to remove leftover saline, crust, or discharge.","Pat dry with clean disposable paper towel or sterile gauze. Avoid cotton pads or towels, as fibres can catch and carry bacteria."]},
    {"title":"What to avoid","listItems":["Avoid excessive moisture. Keep the piercing dry and avoid wet clothing or towels sitting on it.","Choose clean, loose, breathable clothing. Tight clothing can irritate, rub, or snag the piercing.","Do not touch, twist, rotate, or play with jewellery unless needed for cleaning.","Avoid cosmetics, lotions, makeup, creams, and sprays directly on or around the piercing.","Avoid swimming for at least 2-3 weeks, or until your piercer says it is safe."]},
    {"title":"Healing & jewellery","listItems":["Most piercings need 14 to 24 months to fully heal. Be patient and continue appropriate aftercare throughout healing.","Do not change jewellery earlier than 14 months unless your piercer advises it.","If the jewellery feels too tight, or swelling puts pressure on both ends, the jewellery must be sized up immediately by a piercer.","For safe downsizing, upsizing, or jewellery changes, always contact your piercer."]},
    {"title":"Specific piercings","listItems":["Ear piercings: avoid headphones, earbuds, and any mechanical trauma during healing.","Oral piercings: use an alcohol-free antimicrobial mouthwash after eating, drinking, smoking, or vaping if advised."]},
    {"title":"Signs of infection","bodyHtml":"<p style=\"margin:0 0 8px;font-size:13px;line-height:1.65;color:#e8e8e8;\">Signs of infection may include redness, swelling, and pain. This does not mean a little normal irritation, but severe or worsening symptoms.</p><p style=\"margin:0;font-size:13px;line-height:1.65;color:#e8e8e8;\">In case of emergency, please seek immediate medical advice or go to A&amp;E.</p>"}
  ]'::jsonb;
BEGIN
  FOR org_row IN SELECT id FROM public.organizations LOOP
    INSERT INTO public.shop_aftercare_templates (
      organization_id, kind, enabled, badge, title, email_subject, intro_template, sections
    ) VALUES (
      org_row.id,
      'tattoo',
      true,
      'Tattoo aftercare',
      'Tattoo aftercare guide',
      'Tattoo Aftercare',
      'Thank you for booking with {{shopName}}. Your appointment is now starting: {{bookingWindow}}. We like to stay in contact with our clients throughout the healing process — if you have concerns, send us clear photos and we will guide you.',
      tattoo_sections
    )
    ON CONFLICT (organization_id, kind) DO NOTHING;

    INSERT INTO public.shop_aftercare_templates (
      organization_id, kind, enabled, badge, title, email_subject, intro_template, sections
    ) VALUES (
      org_row.id,
      'piercing',
      true,
      'Piercing aftercare',
      'Piercing aftercare guide',
      'Piercing Aftercare',
      'Thank you for booking with {{shopName}}. Your appointment is now starting: {{bookingWindow}}. Please follow your piercer''s advice. Most piercings require 14 to 24 months to fully heal, depending on placement, your body, and lifestyle.',
      piercing_sections
    )
    ON CONFLICT (organization_id, kind) DO NOTHING;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.shop_aftercare_templates TO authenticated;
GRANT EXECUTE ON FUNCTION public.aftercare_org_for_deployment() TO authenticated, service_role;

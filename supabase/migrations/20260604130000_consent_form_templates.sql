-- Editable consent form templates per organization.

CREATE TABLE IF NOT EXISTS public.consent_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  version text NOT NULL DEFAULT '1.0',
  is_active boolean NOT NULL DEFAULT true,
  default_for_category text CHECK (default_for_category IS NULL OR default_for_category IN ('tattoo', 'piercing')),
  sort_order integer NOT NULL DEFAULT 0,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_form_templates_org_slug_unique UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_consent_form_templates_org ON public.consent_form_templates (organization_id);
CREATE INDEX IF NOT EXISTS idx_consent_form_templates_org_active ON public.consent_form_templates (organization_id, is_active);

ALTER TABLE public.consent_signatures
  ADD COLUMN IF NOT EXISTS consent_template_id uuid REFERENCES public.consent_form_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consent_template_slug text;

ALTER TABLE public.consent_form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active consent form templates"
ON public.consent_form_templates
FOR SELECT TO authenticated
USING (
  is_active
  AND (
    organization_id = public.aftercare_org_for_deployment()
    OR public.is_org_member(organization_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "Admins can insert consent form templates"
ON public.consent_form_templates
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update consent form templates"
ON public.consent_form_templates
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete consent form templates"
ON public.consent_form_templates
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Service role can manage consent form templates"
ON public.consent_form_templates
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_consent_form_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consent_form_templates_updated_at ON public.consent_form_templates;
CREATE TRIGGER consent_form_templates_updated_at
  BEFORE UPDATE ON public.consent_form_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_consent_form_templates_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.consent_form_templates TO authenticated;

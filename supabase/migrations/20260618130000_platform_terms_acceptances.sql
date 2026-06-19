-- Audit trail when studios accept Terms / Privacy at subscription checkout.

CREATE TABLE IF NOT EXISTS public.platform_terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  plan_id text,
  source text NOT NULL DEFAULT 'subscribe_checkout',
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_terms_acceptances_user
  ON public.platform_terms_acceptances (user_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_terms_acceptances_org
  ON public.platform_terms_acceptances (organization_id, accepted_at DESC)
  WHERE organization_id IS NOT NULL;

ALTER TABLE public.platform_terms_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own terms acceptances"
  ON public.platform_terms_acceptances FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Platform admins view all terms acceptances"
  ON public.platform_terms_acceptances FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

COMMENT ON TABLE public.platform_terms_acceptances IS
  'Records explicit acceptance of Velbok Terms and Privacy Notice before platform subscription checkout.';

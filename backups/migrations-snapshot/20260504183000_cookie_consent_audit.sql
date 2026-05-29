CREATE TABLE IF NOT EXISTS public.cookie_consent_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_version text NOT NULL,
  method text NOT NULL CHECK (method IN ('accept_all', 'reject_non_essential', 'customize')),
  necessary boolean NOT NULL DEFAULT true,
  preferences boolean NOT NULL DEFAULT false,
  analytics boolean NOT NULL DEFAULT false,
  marketing boolean NOT NULL DEFAULT false,
  page_path text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cookie_consent_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cookie_consent_insert_public"
ON public.cookie_consent_audit
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "cookie_consent_staff_read"
ON public.cookie_consent_audit
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'artist')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "cookie_consent_service_role_manage"
ON public.cookie_consent_audit
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS cookie_consent_audit_created_at_idx
  ON public.cookie_consent_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS cookie_consent_audit_user_id_idx
  ON public.cookie_consent_audit (user_id);

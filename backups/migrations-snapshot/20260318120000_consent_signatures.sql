-- Client consent / waiver signatures (public sign, staff read)
CREATE TABLE public.consent_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  signature_image text,
  agreement_version text NOT NULL DEFAULT '1.0',
  client_acknowledged boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX consent_signatures_created_at_idx ON public.consent_signatures (created_at DESC);

ALTER TABLE public.consent_signatures ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can submit a signed consent
CREATE POLICY "consent_insert_public"
  ON public.consent_signatures FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Authenticated staff can view submissions
CREATE POLICY "consent_select_authenticated"
  ON public.consent_signatures FOR SELECT
  TO authenticated
  USING (true);

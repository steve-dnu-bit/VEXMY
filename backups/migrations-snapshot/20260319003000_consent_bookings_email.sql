-- Extend consent submissions with booking context and optional filled PDF

ALTER TABLE public.consent_signatures
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS artist_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reference_image_url text,
  ADD COLUMN IF NOT EXISTS consent_pdf_url text,
  ADD COLUMN IF NOT EXISTS consent_fields jsonb;

CREATE INDEX IF NOT EXISTS consent_signatures_booking_id_idx
  ON public.consent_signatures (booking_id);

-- Replace overly permissive insert policy.
DROP POLICY IF EXISTS "consent_insert_public" ON public.consent_signatures;

CREATE POLICY "consent_insert_authenticated_own"
  ON public.consent_signatures FOR INSERT
  TO authenticated
  WITH CHECK (
    booking_id IS NOT NULL
    AND (
      -- Customers can only submit for their own bookings
      EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = consent_signatures.booking_id
          AND (
            b.client_user_id = auth.uid()
            OR (
              b.client_email IS NOT NULL
              AND lower(trim(b.client_email)) = lower(trim(auth.jwt() ->> 'email'))
            )
          )
      )
      -- Allow admins/staff to submit for any booking
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'assistant'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
    )
  );

-- Staff can always view submissions; customers only see their own.
DROP POLICY IF EXISTS "consent_select_authenticated" ON public.consent_signatures;

CREATE POLICY "consent_select_authenticated"
  ON public.consent_signatures FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
    OR public.has_role(auth.uid(), 'assistant'::public.app_role)
    OR (
      booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = consent_signatures.booking_id
          AND (
            b.client_user_id = auth.uid()
            OR (
              b.client_email IS NOT NULL
              AND lower(trim(b.client_email)) = lower(trim(auth.jwt() ->> 'email'))
            )
          )
      )
    )
  );


-- Studio review links for manual post-visit review request emails.

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS review_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_email_message text;

COMMENT ON COLUMN public.shop_settings.review_links IS
  'JSON array of {label, url} objects (e.g. Google, Facebook) sent in manual review-request emails.';
COMMENT ON COLUMN public.shop_settings.review_email_message IS
  'Optional short personal note prepended in review-request emails (studio-wide).';

ALTER TABLE public.shop_settings
  DROP CONSTRAINT IF EXISTS shop_settings_review_links_is_array;

ALTER TABLE public.shop_settings
  ADD CONSTRAINT shop_settings_review_links_is_array
  CHECK (jsonb_typeof(review_links) = 'array');

CREATE TABLE IF NOT EXISTS public.booking_review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  client_email text NOT NULL,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_review_requests_booking
  ON public.booking_review_requests (booking_id, sent_at DESC);

ALTER TABLE public.booking_review_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org staff can read review request log"
  ON public.booking_review_requests FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org staff can insert review request log"
  ON public.booking_review_requests FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

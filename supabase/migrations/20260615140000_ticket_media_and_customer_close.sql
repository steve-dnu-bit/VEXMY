-- Ticket image attachments (max 2 per participant) and customer close.

ALTER TABLE public.support_ticket_messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';

ALTER TABLE public.support_ticket_messages DROP CONSTRAINT IF EXISTS support_ticket_messages_message_type_check;
ALTER TABLE public.support_ticket_messages
  ADD CONSTRAINT support_ticket_messages_message_type_check
  CHECK (message_type IN ('text', 'media'));

ALTER TABLE public.support_ticket_messages DROP CONSTRAINT IF EXISTS support_ticket_messages_body_check;
ALTER TABLE public.support_ticket_messages
  ADD CONSTRAINT support_ticket_messages_body_check
  CHECK (message_type = 'media' OR char_length(trim(body)) > 0);

CREATE TABLE IF NOT EXISTS public.support_ticket_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.support_ticket_messages(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket text NOT NULL DEFAULT 'ticket-media',
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_media_ticket_user
  ON public.support_ticket_media (ticket_id, uploaded_by);
CREATE INDEX IF NOT EXISTS idx_support_ticket_media_message
  ON public.support_ticket_media (message_id);

ALTER TABLE public.support_ticket_media ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enforce_ticket_media_per_user_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::integer INTO v_count
  FROM public.support_ticket_media
  WHERE ticket_id = NEW.ticket_id
    AND uploaded_by = NEW.uploaded_by;

  IF v_count >= 2 THEN
    RAISE EXCEPTION 'Each person can attach up to 2 images per conversation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ticket_media_limit ON public.support_ticket_media;
CREATE TRIGGER trg_enforce_ticket_media_limit
  BEFORE INSERT ON public.support_ticket_media
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_media_per_user_limit();

DROP POLICY IF EXISTS "Ticket participants view media" ON public.support_ticket_media;
CREATE POLICY "Ticket participants view media"
  ON public.support_ticket_media FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (
          t.customer_id = auth.uid()
          OR public.staff_can_view_ticket(t.*)
        )
    )
  );

DROP POLICY IF EXISTS "Ticket participants insert media" ON public.support_ticket_media;
CREATE POLICY "Ticket participants insert media"
  ON public.support_ticket_media FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.status = 'open'
        AND (
          t.customer_id = auth.uid()
          OR public.staff_can_view_ticket(t.*)
        )
    )
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-media', 'ticket-media', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Ticket participants read ticket media objects" ON storage.objects;
CREATE POLICY "Ticket participants read ticket media objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-media'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = nullif(split_part(name, '/', 1), '')::uuid
        AND (
          t.customer_id = auth.uid()
          OR public.staff_can_view_ticket(t.*)
        )
    )
  );

DROP POLICY IF EXISTS "Ticket participants upload ticket media objects" ON storage.objects;
CREATE POLICY "Ticket participants upload ticket media objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-media'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = nullif(split_part(name, '/', 1), '')::uuid
        AND t.status = 'open'
        AND (
          t.customer_id = auth.uid()
          OR public.staff_can_view_ticket(t.*)
        )
    )
  );

DROP POLICY IF EXISTS "Customers close own tickets" ON public.support_tickets;
CREATE POLICY "Customers close own tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() AND status = 'open')
  WITH CHECK (customer_id = auth.uid() AND status = 'closed');

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_media;

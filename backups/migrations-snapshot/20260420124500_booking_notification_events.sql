CREATE TABLE IF NOT EXISTS public.booking_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  recipient_role text NOT NULL CHECK (recipient_role IN ('artist', 'customer')),
  recipient_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view booking notification events"
ON public.booking_notification_events
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'artist')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Service role can manage booking notification events"
ON public.booking_notification_events
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS booking_notification_events_booking_id_idx
  ON public.booking_notification_events (booking_id);

CREATE INDEX IF NOT EXISTS booking_notification_events_sent_at_idx
  ON public.booking_notification_events (sent_at DESC);

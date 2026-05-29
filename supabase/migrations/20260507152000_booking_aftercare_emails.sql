CREATE TABLE IF NOT EXISTS public.booking_aftercare_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  aftercare_type text NOT NULL CHECK (aftercare_type IN ('tattoo', 'piercing')),
  recipient_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_aftercare_events_unique_delivery_idx
  ON public.booking_aftercare_events (booking_id, aftercare_type, recipient_email);

ALTER TABLE public.booking_aftercare_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view booking aftercare events"
ON public.booking_aftercare_events
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'artist')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Service role can manage booking aftercare events"
ON public.booking_aftercare_events
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'send-aftercare-emails-every-15-min'
  ) THEN
    PERFORM cron.unschedule('send-aftercare-emails-every-15-min');
  END IF;

  PERFORM cron.schedule(
    'send-aftercare-emails-every-15-min',
    '*/15 * * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://obxnxazrivonewlbyqap.supabase.co/functions/v1/send-aftercare-emails',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $cron$
  );
END
$$;


CREATE TABLE IF NOT EXISTS public.reminder_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_confirmation boolean NOT NULL DEFAULT false,
  deposit_reminder boolean NOT NULL DEFAULT false,
  appointment_reminder boolean NOT NULL DEFAULT false,
  deposit_reminder_timing text NOT NULL DEFAULT '24h',
  appointment_reminder_timing text NOT NULL DEFAULT '24h',
  reminder_channel text NOT NULL DEFAULT 'email',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminder_settings_deposit_timing_check
    CHECK (deposit_reminder_timing IN ('12h', '24h', '48h', '72h', '1w')),
  CONSTRAINT reminder_settings_appointment_timing_check
    CHECK (appointment_reminder_timing IN ('1h', '3h', '12h', '24h', '48h')),
  CONSTRAINT reminder_settings_channel_check
    CHECK (reminder_channel IN ('email', 'sms', 'both'))
);

ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reminder settings"
ON public.reminder_settings
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reminder settings"
ON public.reminder_settings
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reminder settings"
ON public.reminder_settings
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage reminder settings"
ON public.reminder_settings
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.booking_reminder_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('appointment', 'deposit')),
  reminder_timing text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_reminder_events_unique_delivery_idx
  ON public.booking_reminder_events (booking_id, reminder_type, reminder_timing, recipient_email);

ALTER TABLE public.booking_reminder_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view booking reminder events"
ON public.booking_reminder_events
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'artist')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Service role can manage booking reminder events"
ON public.booking_reminder_events
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

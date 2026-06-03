-- Shop-wide email/reminder settings: only admins may read or write reminder_settings.
-- Migrate any existing per-artist row onto the primary admin account.

DO $$
DECLARE
  admin_uid uuid;
  src public.reminder_settings%ROWTYPE;
BEGIN
  SELECT ur.user_id INTO admin_uid
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
  ORDER BY ur.user_id
  LIMIT 1;

  IF admin_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO src
  FROM public.reminder_settings rs
  WHERE rs.user_id <> admin_uid
  ORDER BY rs.updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO src FROM public.reminder_settings rs WHERE rs.user_id = admin_uid;
  END IF;

  IF FOUND THEN
    INSERT INTO public.reminder_settings (
      user_id,
      booking_confirmation,
      deposit_reminder,
      appointment_reminder,
      deposit_reminder_timing,
      appointment_reminder_timing,
      reminder_channel,
      updated_at
    )
    VALUES (
      admin_uid,
      src.booking_confirmation,
      src.deposit_reminder,
      src.appointment_reminder,
      src.deposit_reminder_timing,
      src.appointment_reminder_timing,
      src.reminder_channel,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      booking_confirmation = EXCLUDED.booking_confirmation,
      deposit_reminder = EXCLUDED.deposit_reminder,
      appointment_reminder = EXCLUDED.appointment_reminder,
      deposit_reminder_timing = EXCLUDED.deposit_reminder_timing,
      appointment_reminder_timing = EXCLUDED.appointment_reminder_timing,
      reminder_channel = EXCLUDED.reminder_channel,
      updated_at = now();
  END IF;

  DELETE FROM public.reminder_settings WHERE user_id <> admin_uid;
END $$;

DROP POLICY IF EXISTS "Users can view own reminder settings" ON public.reminder_settings;
DROP POLICY IF EXISTS "Users can insert own reminder settings" ON public.reminder_settings;
DROP POLICY IF EXISTS "Users can update own reminder settings" ON public.reminder_settings;

CREATE POLICY "Admins can view shop reminder settings"
ON public.reminder_settings
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert shop reminder settings"
ON public.reminder_settings
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update shop reminder settings"
ON public.reminder_settings
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

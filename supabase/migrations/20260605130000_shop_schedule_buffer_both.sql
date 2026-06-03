-- Allow extra buffer both before open and after close.

ALTER TABLE public.shop_settings
  DROP CONSTRAINT IF EXISTS shop_settings_schedule_extra_buffer_at_check;

ALTER TABLE public.shop_settings
  ADD CONSTRAINT shop_settings_schedule_extra_buffer_at_check
  CHECK (schedule_extra_buffer_at IN ('start', 'end', 'both'));

COMMENT ON COLUMN public.shop_settings.schedule_extra_buffer_at IS
  'Whether extra buffer time is before open (start), after close (end), or both.';

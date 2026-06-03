-- Shop working hours for the schedule grid (admin-configurable).

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS schedule_open_time time NOT NULL DEFAULT '11:00',
  ADD COLUMN IF NOT EXISTS schedule_close_time time NOT NULL DEFAULT '23:00',
  ADD COLUMN IF NOT EXISTS schedule_extra_buffer_minutes integer NOT NULL DEFAULT 60
    CHECK (schedule_extra_buffer_minutes >= 0 AND schedule_extra_buffer_minutes <= 180),
  ADD COLUMN IF NOT EXISTS schedule_extra_buffer_at text NOT NULL DEFAULT 'end'
    CHECK (schedule_extra_buffer_at IN ('start', 'end'));

COMMENT ON COLUMN public.shop_settings.schedule_open_time IS 'Daily shop open time shown on the schedule grid.';
COMMENT ON COLUMN public.shop_settings.schedule_close_time IS 'Daily shop close time shown on the schedule grid.';
COMMENT ON COLUMN public.shop_settings.schedule_extra_buffer_minutes IS 'Extra minutes before open or after close for overflow bookings.';
COMMENT ON COLUMN public.shop_settings.schedule_extra_buffer_at IS 'Whether extra buffer time is before open (start) or after close (end).';

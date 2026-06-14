-- Link POS desk payments back to schedule bookings

ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pos_sales_booking_idx
  ON public.pos_sales (booking_id)
  WHERE booking_id IS NOT NULL;

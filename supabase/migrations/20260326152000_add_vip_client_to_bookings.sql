-- Deposits page: allow marking customers as VIP
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS vip_client boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bookings.vip_client IS 'Marks the booking client as VIP for deposits workflow.';


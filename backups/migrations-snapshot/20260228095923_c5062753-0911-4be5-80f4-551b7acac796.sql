
CREATE TABLE public.services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  duration integer NOT NULL DEFAULT 60,
  booking_type text NOT NULL DEFAULT 'session',
  color text NOT NULL DEFAULT 'blue',
  price numeric DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Admins can manage services" ON public.services FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Artists can insert services" ON public.services FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Artists can update own services" ON public.services FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Artists can delete own services" ON public.services FOR DELETE USING (auth.uid() = created_by);

-- Seed default services
INSERT INTO public.services (name, duration, booking_type, color, sort_order, created_by) VALUES
  ('Consultation', 30, 'consultation', 'blue', 0, '00000000-0000-0000-0000-000000000000'),
  ('Small Tattoo', 60, 'session', 'amber', 1, '00000000-0000-0000-0000-000000000000'),
  ('Medium Tattoo', 120, 'session', 'gold', 2, '00000000-0000-0000-0000-000000000000'),
  ('Large Tattoo', 240, 'session', 'red', 3, '00000000-0000-0000-0000-000000000000'),
  ('Full Day Session', 480, 'session', 'violet', 4, '00000000-0000-0000-0000-000000000000'),
  ('Touch-up', 60, 'touch-up', 'emerald', 5, '00000000-0000-0000-0000-000000000000'),
  ('Piercing', 30, 'session', 'pink', 6, '00000000-0000-0000-0000-000000000000');

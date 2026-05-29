
-- Companies table for dual-company billing
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text NOT NULL,
  stripe_account_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage companies" ON public.companies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view companies" ON public.companies FOR SELECT TO authenticated
  USING (true);

-- Add company_id to bookings
ALTER TABLE public.bookings ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- Stock catalog items
CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  unit text NOT NULL DEFAULT 'pcs',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view stock items" ON public.stock_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage stock items" ON public.stock_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Stock requests from artists
CREATE TABLE public.stock_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id),
  quantity integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all stock requests" ON public.stock_requests FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Staff can create stock requests" ON public.stock_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Admins can manage stock requests" ON public.stock_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Deposit tracking (payment link sent via email/SMS)
ALTER TABLE public.bookings ADD COLUMN deposit_link_sent boolean DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN deposit_payment_id text;

-- Seed companies
INSERT INTO public.companies (name, legal_name) VALUES
  ('Inkaholics', 'Inkaholics Limited'),
  ('Skin Art', 'Skin Art Solutions Ltd');

-- Seed stock catalog
INSERT INTO public.stock_items (name, category, unit) VALUES
  ('Round Liner Needles (3RL)', 'needles', 'box'),
  ('Round Liner Needles (5RL)', 'needles', 'box'),
  ('Round Liner Needles (7RL)', 'needles', 'box'),
  ('Round Liner Needles (9RL)', 'needles', 'box'),
  ('Magnum Needles (7M1)', 'needles', 'box'),
  ('Magnum Needles (9M1)', 'needles', 'box'),
  ('Magnum Needles (11M1)', 'needles', 'box'),
  ('Curved Magnum (7CM)', 'needles', 'box'),
  ('Curved Magnum (9CM)', 'needles', 'box'),
  ('Black Ink (1oz)', 'ink', 'bottle'),
  ('Black Ink (4oz)', 'ink', 'bottle'),
  ('White Ink (1oz)', 'ink', 'bottle'),
  ('Color Ink Set (Basic)', 'ink', 'set'),
  ('Color Ink Set (Extended)', 'ink', 'set'),
  ('Disposable Grips', 'grips', 'box'),
  ('Cartridge Grips', 'grips', 'box'),
  ('Transfer Paper', 'supplies', 'pack'),
  ('Stencil Fluid', 'supplies', 'bottle'),
  ('Green Soap', 'supplies', 'bottle'),
  ('Vaseline', 'supplies', 'tub'),
  ('Disposable Razors', 'supplies', 'pack'),
  ('Nitrile Gloves (S)', 'gloves', 'box'),
  ('Nitrile Gloves (M)', 'gloves', 'box'),
  ('Nitrile Gloves (L)', 'gloves', 'box'),
  ('Nitrile Gloves (XL)', 'gloves', 'box'),
  ('Clip Cord Sleeves', 'barriers', 'roll'),
  ('Machine Bags', 'barriers', 'box'),
  ('Surface Barriers', 'barriers', 'roll'),
  ('Ink Cups (Small)', 'supplies', 'bag'),
  ('Ink Cups (Large)', 'supplies', 'bag'),
  ('Aftercare Cream', 'aftercare', 'tube'),
  ('Derm Shield / Second Skin', 'aftercare', 'roll'),
  ('Paper Towels', 'supplies', 'pack'),
  ('Couch Roll', 'supplies', 'roll');

-- Add updated_at triggers
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stock_requests_updated_at BEFORE UPDATE ON public.stock_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for stock_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_requests;

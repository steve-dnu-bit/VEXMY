-- POS checkout: Stripe Terminal (WisePad) settings, artist splits, and sale records

CREATE TABLE IF NOT EXISTS public.shop_pos_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  shop_split_percent numeric(5, 2) NOT NULL DEFAULT 30
    CHECK (shop_split_percent >= 0 AND shop_split_percent <= 100),
  artist_split_percent numeric(5, 2) NOT NULL DEFAULT 70
    CHECK (artist_split_percent >= 0 AND artist_split_percent <= 100),
  gratuity_enabled boolean NOT NULL DEFAULT true,
  default_gratuity_percent numeric(5, 2) NOT NULL DEFAULT 0
    CHECK (default_gratuity_percent >= 0 AND default_gratuity_percent <= 100),
  stripe_terminal_location_id text,
  reader_label text NOT NULL DEFAULT 'WisePad',
  simulated_reader boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.artist_pos_splits (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_split_percent numeric(5, 2) NOT NULL
    CHECK (shop_split_percent >= 0 AND shop_split_percent <= 100),
  artist_split_percent numeric(5, 2) NOT NULL
    CHECK (artist_split_percent >= 0 AND artist_split_percent <= 100),
  stripe_connect_account_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, artist_id)
);

CREATE TABLE IF NOT EXISTS public.pos_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  client_name text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  currency text NOT NULL DEFAULT 'gbp',
  subtotal numeric(12, 2) NOT NULL DEFAULT 0,
  tax_amount numeric(12, 2) NOT NULL DEFAULT 0,
  gratuity_amount numeric(12, 2) NOT NULL DEFAULT 0,
  total numeric(12, 2) NOT NULL DEFAULT 0,
  shop_amount numeric(12, 2) NOT NULL DEFAULT 0,
  artist_amount numeric(12, 2) NOT NULL DEFAULT 0,
  shop_split_percent numeric(5, 2) NOT NULL,
  artist_split_percent numeric(5, 2) NOT NULL,
  stripe_payment_intent_id text,
  stripe_terminal_reader_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_sales_org_created_idx
  ON public.pos_sales (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pos_sales_artist_idx
  ON public.pos_sales (artist_id, created_at DESC);

ALTER TABLE public.shop_pos_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_pos_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view POS settings" ON public.shop_pos_settings;
CREATE POLICY "Org members can view POS settings"
  ON public.shop_pos_settings FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Org admins can manage POS settings" ON public.shop_pos_settings;
CREATE POLICY "Org admins can manage POS settings"
  ON public.shop_pos_settings FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org members can view artist POS splits" ON public.artist_pos_splits;
CREATE POLICY "Org members can view artist POS splits"
  ON public.artist_pos_splits FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Org admins can manage artist POS splits" ON public.artist_pos_splits;
CREATE POLICY "Org admins can manage artist POS splits"
  ON public.artist_pos_splits FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org staff can view POS sales" ON public.pos_sales;
CREATE POLICY "Org staff can view POS sales"
  ON public.pos_sales FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
      OR public.has_permission(auth.uid(), 'checkout')
    )
  );

DROP POLICY IF EXISTS "Org staff can insert POS sales" ON public.pos_sales;
CREATE POLICY "Org staff can insert POS sales"
  ON public.pos_sales FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
      OR public.has_permission(auth.uid(), 'checkout')
    )
  );

DROP POLICY IF EXISTS "Org staff can update POS sales" ON public.pos_sales;
CREATE POLICY "Org staff can update POS sales"
  ON public.pos_sales FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
      OR public.has_permission(auth.uid(), 'checkout')
    )
  );

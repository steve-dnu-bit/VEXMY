-- Saved end-of-day and end-of-month sales snapshots for the dashboard

CREATE TABLE IF NOT EXISTS public.shop_sales_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('day', 'month')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text NOT NULL DEFAULT 'gbp',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, report_type, period_start)
);

CREATE INDEX IF NOT EXISTS shop_sales_reports_org_type_idx
  ON public.shop_sales_reports (organization_id, report_type, period_start DESC);

ALTER TABLE public.shop_sales_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org staff can view sales reports" ON public.shop_sales_reports;
CREATE POLICY "Org staff can view sales reports"
  ON public.shop_sales_reports FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
      OR public.has_permission(auth.uid(), 'checkout')
    )
  );

DROP POLICY IF EXISTS "Org billing can upsert sales reports" ON public.shop_sales_reports;
CREATE POLICY "Org billing can upsert sales reports"
  ON public.shop_sales_reports FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
      OR public.has_permission(auth.uid(), 'checkout')
    )
  );

DROP POLICY IF EXISTS "Org billing can update sales reports" ON public.shop_sales_reports;
CREATE POLICY "Org billing can update sales reports"
  ON public.shop_sales_reports FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
      OR public.has_permission(auth.uid(), 'checkout')
    )
  );

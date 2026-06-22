-- Studio expenses and categories for accounting-lite

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  sort_order int NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'gbp',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  vendor text,
  notes text,
  receipt_path text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_org_date_idx
  ON public.expenses (organization_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS expenses_org_category_idx
  ON public.expenses (organization_id, category_id);

CREATE INDEX IF NOT EXISTS expense_categories_org_idx
  ON public.expense_categories (organization_id, sort_order);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org staff can view expense categories" ON public.expense_categories;
CREATE POLICY "Org staff can view expense categories"
  ON public.expense_categories FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
    )
  );

DROP POLICY IF EXISTS "Org billing can manage expense categories" ON public.expense_categories;
CREATE POLICY "Org billing can manage expense categories"
  ON public.expense_categories FOR ALL TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
    )
  );

DROP POLICY IF EXISTS "Org staff can view expenses" ON public.expenses;
CREATE POLICY "Org staff can view expenses"
  ON public.expenses FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
    )
  );

DROP POLICY IF EXISTS "Org billing can insert expenses" ON public.expenses;
CREATE POLICY "Org billing can insert expenses"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
    )
  );

DROP POLICY IF EXISTS "Org billing can update expenses" ON public.expenses;
CREATE POLICY "Org billing can update expenses"
  ON public.expenses FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
    )
  );

DROP POLICY IF EXISTS "Org billing can delete expenses" ON public.expenses;
CREATE POLICY "Org billing can delete expenses"
  ON public.expenses FOR DELETE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
    )
  );

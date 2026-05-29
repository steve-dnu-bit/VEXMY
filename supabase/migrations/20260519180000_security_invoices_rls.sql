-- Restrict invoice visibility: staff with billing/schedule access, customers see own rows only.

DROP POLICY IF EXISTS "Staff can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Customers can view own invoices" ON public.invoices;

CREATE POLICY "Staff can view invoices"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
    OR public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_permission(auth.uid(), 'billing')
  );

CREATE POLICY "Customers can view own invoices"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'customer'::public.app_role
    )
    AND COALESCE(NULLIF(trim(client_email), ''), NULL) IS NOT NULL
    AND lower(trim(client_email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
  );

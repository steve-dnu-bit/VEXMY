-- Only staff can close inbox conversations; customers reply only.

DROP POLICY IF EXISTS "Customers close own tickets" ON public.support_tickets;

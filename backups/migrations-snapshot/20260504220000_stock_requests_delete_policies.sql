-- Allow deleting stock requests:
-- - Admins can delete any request (matches existing "Admins can manage stock requests" intent)
-- - Requesters can delete their own pending requests (remove mistaken submissions)

DROP POLICY IF EXISTS "Admins can delete stock requests" ON public.stock_requests;
CREATE POLICY "Admins can delete stock requests"
ON public.stock_requests
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can delete own pending stock requests" ON public.stock_requests;
CREATE POLICY "Users can delete own pending stock requests"
ON public.stock_requests
FOR DELETE TO authenticated
USING (auth.uid() = requested_by AND status = 'pending');

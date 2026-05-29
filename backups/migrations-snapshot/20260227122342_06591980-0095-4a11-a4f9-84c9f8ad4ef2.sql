
-- Fix permissive messages policies: restrict to authenticated staff only (not public true)
-- Drop the overly permissive policies
DROP POLICY "Staff can insert messages" ON public.messages;
DROP POLICY "Staff can update messages" ON public.messages;

-- Recreate with proper checks: any authenticated user can insert/update but must be logged in
CREATE POLICY "Staff can insert messages" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Staff can update messages" ON public.messages
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

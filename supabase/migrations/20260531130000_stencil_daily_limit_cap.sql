-- Cap the AI stencil daily allowance at 10 generations per studio.
--
-- The daily allowance is one generation per occupied artist seat. The largest
-- plan tops out at 10 artist seats, so 10 is the maximum a studio can ever be
-- entitled to in a single day. This makes that ceiling explicit and bounded, so
-- the on-screen countdown can never show more than 10 even if seat accounting
-- ever returns a higher number.
CREATE OR REPLACE FUNCTION public.stencil_daily_limit(_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT LEAST(10, GREATEST(1, COALESCE(public.org_artist_seat_count(_org_id), 1)));
$$;

-- Monthly AI stencil generation quota per staff user (max 10).

CREATE TABLE IF NOT EXISTS public.stencil_ai_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  generation_count INTEGER NOT NULL DEFAULT 0 CHECK (generation_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_month)
);

ALTER TABLE public.stencil_ai_usage ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stencil_ai_usage IS 'Tracks AI stencil generations per user per calendar month. Writes via service role only.';

CREATE OR REPLACE FUNCTION public.stencil_ai_remaining()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    0,
    10 - COALESCE(
      (
        SELECT u.generation_count
        FROM public.stencil_ai_usage u
        WHERE u.user_id = auth.uid()
          AND u.period_month = date_trunc('month', now())::date
      ),
      0
    )
  );
$$;

REVOKE ALL ON FUNCTION public.stencil_ai_remaining() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stencil_ai_remaining() TO authenticated;

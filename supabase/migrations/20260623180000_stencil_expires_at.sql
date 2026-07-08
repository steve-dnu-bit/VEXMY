-- 24-hour retention window for generated stencils (purge job uses expires_at).
ALTER TABLE public.stencils
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE public.stencils
SET expires_at = created_at + interval '24 hours'
WHERE expires_at IS NULL;

ALTER TABLE public.stencils
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours'),
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS stencils_expires_at_idx ON public.stencils (expires_at);

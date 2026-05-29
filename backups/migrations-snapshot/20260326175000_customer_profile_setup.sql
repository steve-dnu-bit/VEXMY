-- Customer profile setup completion flag (password + basic profile)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS customer_profile_completed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.customer_profile_completed IS 'Whether the customer has completed invited onboarding (password + profile).';

-- Existing users should not be forced into setup again.
UPDATE public.profiles
SET customer_profile_completed = true
WHERE customer_profile_completed IS DISTINCT FROM true;


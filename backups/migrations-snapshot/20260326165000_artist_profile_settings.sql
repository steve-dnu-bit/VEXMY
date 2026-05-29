-- Artist profile settings for public-facing portal
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS portal_bg_color text,
  ADD COLUMN IF NOT EXISTS portal_bg_image_url text,
  ADD COLUMN IF NOT EXISTS portal_public_bio text,
  ADD COLUMN IF NOT EXISTS public_contact_email text,
  ADD COLUMN IF NOT EXISTS public_contact_phone text,
  ADD COLUMN IF NOT EXISTS public_instagram text,
  ADD COLUMN IF NOT EXISTS public_profile_completed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.portal_bg_color IS 'Background color used on customer-facing pages';
COMMENT ON COLUMN public.profiles.portal_bg_image_url IS 'Background image URL used on customer-facing pages';
COMMENT ON COLUMN public.profiles.portal_public_bio IS 'Short artist bio visible to customers';
COMMENT ON COLUMN public.profiles.public_contact_email IS 'Public contact email for customers';
COMMENT ON COLUMN public.profiles.public_contact_phone IS 'Public contact phone for customers';
COMMENT ON COLUMN public.profiles.public_instagram IS 'Public Instagram handle for customers';
COMMENT ON COLUMN public.profiles.public_profile_completed IS 'Whether artist completed profile setup flow';

-- Do not force existing artists through setup again.
UPDATE public.profiles
SET public_profile_completed = true
WHERE public_profile_completed IS DISTINCT FROM true;


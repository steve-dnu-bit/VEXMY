ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS app_theme_preference text NOT NULL DEFAULT 'dark'
CHECK (app_theme_preference IN ('dark', 'light'));


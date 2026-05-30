-- User language preference for app-wide i18n (11 supported locales).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_language_preference text NOT NULL DEFAULT 'en'
  CHECK (
    app_language_preference IN (
      'en', 'de', 'fr', 'ro', 'it', 'es', 'sv', 'no', 'nl', 'uk', 'bg'
    )
  );

COMMENT ON COLUMN public.profiles.app_language_preference IS 'UI language code: en, de, fr, ro, it, es, sv, no, nl, uk, bg';

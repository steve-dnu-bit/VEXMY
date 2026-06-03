-- Shop-wide vs per-artist dashboard / staff app theming.

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS dashboard_theme_mode text NOT NULL DEFAULT 'per_artist'
    CHECK (dashboard_theme_mode IN ('per_artist', 'shop')),
  ADD COLUMN IF NOT EXISTS shop_portal_bg_color text,
  ADD COLUMN IF NOT EXISTS shop_portal_bg_image_url text;

COMMENT ON COLUMN public.shop_settings.dashboard_theme_mode IS
  'per_artist: each artist sets portal colors on their profile; shop: one shared staff app theme.';
COMMENT ON COLUMN public.shop_settings.shop_portal_bg_color IS 'Shared background color when dashboard_theme_mode = shop.';
COMMENT ON COLUMN public.shop_settings.shop_portal_bg_image_url IS 'Shared background image when dashboard_theme_mode = shop.';

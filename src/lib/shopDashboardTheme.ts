import { supabase } from "@/integrations/supabase/client";
import { loadShopSettings } from "@/lib/shopSettings";

export type DashboardThemeMode = "per_artist" | "shop";

export interface ShopDashboardThemeSettings {
  mode: DashboardThemeMode;
  portalBgColor: string | null;
  portalBgImageUrl: string | null;
}

export const defaultShopDashboardThemeSettings: ShopDashboardThemeSettings = {
  mode: "per_artist",
  portalBgColor: "#141416",
  portalBgImageUrl: null,
};

export const PORTAL_THEME_UPDATED_EVENT = "velbok:portal-theme-updated";

export function notifyPortalThemeUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PORTAL_THEME_UPDATED_EVENT));
}

function rowToSettings(row: {
  dashboard_theme_mode?: string | null;
  shop_portal_bg_color?: string | null;
  shop_portal_bg_image_url?: string | null;
}): ShopDashboardThemeSettings {
  return {
    mode: row.dashboard_theme_mode === "shop" ? "shop" : "per_artist",
    portalBgColor: row.shop_portal_bg_color?.trim() || defaultShopDashboardThemeSettings.portalBgColor,
    portalBgImageUrl: row.shop_portal_bg_image_url?.trim() || null,
  };
}

export async function loadShopDashboardThemeSettings(): Promise<ShopDashboardThemeSettings> {
  const shop = await loadShopSettings();
  if (!shop?.id) return { ...defaultShopDashboardThemeSettings };

  const { data, error } = await supabase
    .from("shop_settings" as any)
    .select("dashboard_theme_mode, shop_portal_bg_color, shop_portal_bg_image_url")
    .eq("id", shop.id)
    .maybeSingle();

  if (error || !data) return { ...defaultShopDashboardThemeSettings };
  return rowToSettings(data);
}

export async function saveShopDashboardThemeSettings(
  settings: ShopDashboardThemeSettings,
): Promise<{ error: string | null }> {
  const shop = await loadShopSettings();
  if (!shop?.id) return { error: "Shop settings not found" };

  const { error } = await supabase
    .from("shop_settings" as any)
    .update({
      dashboard_theme_mode: settings.mode === "shop" ? "shop" : "per_artist",
      shop_portal_bg_color: settings.portalBgColor?.trim() || null,
      shop_portal_bg_image_url: settings.portalBgImageUrl?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shop.id);

  if (!error) notifyPortalThemeUpdated();
  return { error: error?.message ?? null };
}

export async function resolveStaffPortalTheme(userId: string): Promise<{
  color: string | null;
  image: string | null;
  mode: DashboardThemeMode;
}> {
  const shop = await loadShopDashboardThemeSettings();
  if (shop.mode === "shop") {
    return {
      color: shop.portalBgColor,
      image: shop.portalBgImageUrl,
      mode: "shop",
    };
  }

  const { data } = await supabase
    .from("profiles")
    .select("portal_bg_color, portal_bg_image_url")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    color: data?.portal_bg_color ?? null,
    image: data?.portal_bg_image_url ?? null,
    mode: "per_artist",
  };
}

export async function canArtistCustomizeDashboardTheme(): Promise<boolean> {
  const shop = await loadShopDashboardThemeSettings();
  return shop.mode === "per_artist";
}

import { appLanguageFromShopCountry, type AppLanguage } from "@/i18n/languages";
import { shopCountryFromGeoCode, type ShopCountryCode } from "@/lib/shopCurrency";

const GEO_COUNTRY_PATH = "/api/geo-country";

export type GeoCountryResult = {
  shopCountry: ShopCountryCode;
  geoCountryCode: string;
};

/** Map Netlify geo ISO code to a supported Velbok shop country, or null if unsupported. */
export { shopCountryFromGeoCode };

/**
 * Suggest shop country from visitor IP (Netlify Edge on production).
 * Returns null when geo is unavailable (local dev, unsupported country, network error).
 */
/** Suggest app UI language from visitor IP (Netlify Edge). Returns null when unavailable. */
export async function detectAppLanguageFromIp(): Promise<AppLanguage | null> {
  const geo = await detectShopCountryFromIp();
  if (!geo) return null;
  return appLanguageFromShopCountry(geo.shopCountry);
}

export async function detectShopCountryFromIp(): Promise<GeoCountryResult | null> {
  try {
    const res = await fetch(GEO_COUNTRY_PATH, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { countryCode?: string | null };
    const geoCode = data.countryCode?.trim().toUpperCase();
    if (!geoCode) return null;

    const shopCountry = shopCountryFromGeoCode(geoCode);
    if (!shopCountry) return null;

    return { shopCountry, geoCountryCode: geoCode };
  } catch {
    return null;
  }
}

export function shouldSuggestCountryFromGeo(
  shop: { country?: string | null; setup_completed_at?: string | null } | null,
): boolean {
  if (shop?.setup_completed_at) return false;
  if (!shop) return true;
  const raw = (shop.country || "").trim().toUpperCase();
  if (!raw || raw === "UK" || raw === "GB" || raw === "UNITED KINGDOM") return true;
  return false;
}

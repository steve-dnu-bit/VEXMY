import { BRANDING } from "@/lib/branding";
import { isNativeApp } from "@/lib/platform";

/** Netlify serverless routes (AI stencil, geo). Relative on web; absolute on Capacitor. */
export function resolveAppApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!isNativeApp()) return normalized;
  const base = (
    import.meta.env.VITE_SITE_URL?.trim() ||
    import.meta.env.VITE_SHOP_WEBSITE_URL?.trim() ||
    BRANDING.websiteUrl ||
    "https://velbok.com"
  ).replace(/\/$/, "");
  return `${base}${normalized}`;
}

import { isNativeApp } from "@/lib/platform";
import { BRANDING } from "@/lib/branding";

/** Netlify-hosted API routes (e.g. /api/generate-stencil) are not bundled in the native app. */
export function getNetlifyApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!isNativeApp()) return normalizedPath;

  const base =
    import.meta.env.VITE_SITE_URL?.trim() ||
    import.meta.env.VITE_SHOP_WEBSITE_URL?.trim() ||
    BRANDING.websiteUrl;
  return `${base.replace(/\/$/, "")}${normalizedPath}`;
}

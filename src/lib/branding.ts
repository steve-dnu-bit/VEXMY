/** Platform and shop branding — override via VITE_* env vars per deployment. */
export const BRANDING = {
  platformName: import.meta.env.VITE_PLATFORM_NAME || "Velbok",
  platformTagline: import.meta.env.VITE_PLATFORM_TAGLINE || "Tattoo Studio Platform",
  shopName: import.meta.env.VITE_SHOP_NAME || import.meta.env.VITE_PLATFORM_NAME || "Velbok",
  shopLegalName: import.meta.env.VITE_SHOP_LEGAL_NAME || "Inkaholics Limited",
  shopTradingName: import.meta.env.VITE_SHOP_TRADING_NAME || import.meta.env.VITE_SHOP_NAME || "Velbok",
  supportEmail:
    import.meta.env.VITE_SHOP_SUPPORT_EMAIL || "support@velbok.com",
  supportPhone: import.meta.env.VITE_SHOP_SUPPORT_PHONE || "",
  privacyEmail:
    import.meta.env.VITE_SHOP_PRIVACY_EMAIL ||
    import.meta.env.VITE_SHOP_SUPPORT_EMAIL ||
    "privacy@velbok.com",
  dpoEmail:
    import.meta.env.VITE_SHOP_DPO_EMAIL ||
    import.meta.env.VITE_SHOP_PRIVACY_EMAIL ||
    import.meta.env.VITE_SHOP_SUPPORT_EMAIL ||
    "privacy@velbok.com",
  websiteUrl: import.meta.env.VITE_SHOP_WEBSITE_URL || import.meta.env.VITE_SITE_URL || "https://velbok.com",
  address: import.meta.env.VITE_SHOP_ADDRESS || "",
  accentColor: import.meta.env.VITE_SHOP_ACCENT_COLOR || "hsl(43, 34%, 54%)",
  /** V mark only — transparent PNG for in-app UI beside the wordmark text. */
  markSrc: "/icons/logo-mark.png",
  /** Full lockup with velbok.com text (black background). */
  logoFullSrc: "/brand/logo-with-text-black.png",
  logoSrc: "/icons/logo-mark.png",
  iconSrc: "/icons/icon-512-plain.png",
} as const;

export const STORAGE_PREFIX = "velbok";

export const CONSENT_TATTOO_DATA_STORAGE =
  "I give my permission for the studio to store my personal data for legal, medical, and insurance reasons.";

export const CONSENT_PIERCING_DATA_STORAGE =
  "I give my permission for the studio and any piercer in the shop to store my personal data for legal, medical, and insurance reasons.";

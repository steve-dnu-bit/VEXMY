/** Platform and shop branding — override via VITE_* env vars per deployment. */
export const BRANDING = {
  platformName: import.meta.env.VITE_PLATFORM_NAME || "Velbok",
  platformTagline: import.meta.env.VITE_PLATFORM_TAGLINE || "Tattoo Studio Platform",
  shopName: import.meta.env.VITE_SHOP_NAME || import.meta.env.VITE_PLATFORM_NAME || "Velbok",
  shopLegalName: import.meta.env.VITE_SHOP_LEGAL_NAME || "Your Studio Ltd",
  shopTradingName: import.meta.env.VITE_SHOP_TRADING_NAME || import.meta.env.VITE_SHOP_NAME || "Your Tattoo Studio",
  supportEmail: import.meta.env.VITE_SHOP_SUPPORT_EMAIL || "support@example.com",
  privacyEmail:
    import.meta.env.VITE_SHOP_PRIVACY_EMAIL ||
    import.meta.env.VITE_SHOP_SUPPORT_EMAIL ||
    "privacy@example.com",
  dpoEmail:
    import.meta.env.VITE_SHOP_DPO_EMAIL ||
    import.meta.env.VITE_SHOP_PRIVACY_EMAIL ||
    import.meta.env.VITE_SHOP_SUPPORT_EMAIL ||
    "dpo@example.com",
  websiteUrl: import.meta.env.VITE_SHOP_WEBSITE_URL || "",
  address: import.meta.env.VITE_SHOP_ADDRESS || "",
  accentColor: import.meta.env.VITE_SHOP_ACCENT_COLOR || "#d4af37",
} as const;

export const STORAGE_PREFIX = "velbok";

export const CONSENT_TATTOO_DATA_STORAGE =
  "I give my permission for the studio to store my personal data for legal, medical, and insurance reasons.";

export const CONSENT_PIERCING_DATA_STORAGE =
  "I give my permission for the studio and any piercer in the shop to store my personal data for legal, medical, and insurance reasons.";

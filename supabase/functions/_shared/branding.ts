export interface ShopBranding {
  platformName: string;
  shopName: string;
  legalName: string;
  tradingName: string;
  supportEmail: string;
  privacyEmail: string;
  websiteUrl: string;
  address: string;
  accentColor: string;
  tattooDataStorageText: string;
  piercingDataStorageText: string;
}

export function getShopBranding(): ShopBranding {
  const platformName = Deno.env.get("PLATFORM_NAME") || "Velbok";
  const shopName = Deno.env.get("SHOP_NAME") || platformName;
  const legalName = Deno.env.get("SHOP_LEGAL_NAME") || "Your Studio Ltd";
  const tradingName = Deno.env.get("SHOP_TRADING_NAME") || shopName;
  const supportEmail = Deno.env.get("SHOP_SUPPORT_EMAIL") || Deno.env.get("EMAIL_FROM") || "support@example.com";

  return {
    platformName,
    shopName,
    legalName,
    tradingName,
    supportEmail,
    privacyEmail: Deno.env.get("SHOP_PRIVACY_EMAIL") || supportEmail,
    websiteUrl: Deno.env.get("SHOP_WEBSITE_URL") || "",
    address: Deno.env.get("SHOP_ADDRESS") || "",
    accentColor: Deno.env.get("SHOP_ACCENT_COLOR") || "#f4c24d",
    tattooDataStorageText:
      Deno.env.get("CONSENT_TATTOO_DATA_STORAGE") ||
      "I give my permission for the studio to store my personal data for legal, medical, and insurance reasons.",
    piercingDataStorageText:
      Deno.env.get("CONSENT_PIERCING_DATA_STORAGE") ||
      "I give my permission for the studio and any piercer in the shop to store my personal data for legal, medical, and insurance reasons.",
  };
}

export function emailBrandHeader(brand: ShopBranding, size = 28): string {
  return `<div style="font-size:${size}px;font-weight:900;letter-spacing:.7px;color:${brand.accentColor};">${brand.shopName.toUpperCase()}</div>`;
}

export function emailBrandHeaderLarge(brand: ShopBranding): string {
  return emailBrandHeader(brand, 30);
}

export function emailSupportLine(brand: ShopBranding): string {
  if (brand.supportEmail) {
    return `<p style="margin:14px 0 0;font-size:13px;color:#555;">Questions? Reply to this email or contact <a href="mailto:${brand.supportEmail}">${brand.supportEmail}</a></p>`;
  }
  return "";
}

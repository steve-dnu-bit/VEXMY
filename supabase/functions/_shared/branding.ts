import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

type ShopSettingsBrandingRow = {
  shop_name?: string | null;
  legal_name?: string | null;
  trading_name?: string | null;
  support_email?: string | null;
  privacy_email?: string | null;
  website_url?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postcode?: string | null;
  accent_color?: string | null;
  consent_tattoo_data_storage_text?: string | null;
  consent_piercing_data_storage_text?: string | null;
};

function formatShopAddress(row: ShopSettingsBrandingRow | null | undefined): string {
  if (!row) return "";
  return [row.address_line1, row.address_line2, row.city, row.postcode].filter(Boolean).join(", ");
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

export async function getShopBrandingForOrganization(
  admin: SupabaseClient,
  organizationId: string | null | undefined,
): Promise<ShopBranding> {
  const base = getShopBranding();
  if (!organizationId) return base;

  const [{ data: shopRow }, { data: orgRow }] = await Promise.all([
    admin
      .from("shop_settings")
      .select(
        "shop_name, legal_name, trading_name, support_email, privacy_email, website_url, address_line1, address_line2, city, postcode, accent_color, consent_tattoo_data_storage_text, consent_piercing_data_storage_text",
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
    admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
  ]);

  const shop = shopRow as ShopSettingsBrandingRow | null;
  const orgName = (orgRow as { name?: string | null } | null)?.name?.trim() || null;
  const displayName =
    shop?.trading_name?.trim() ||
    shop?.shop_name?.trim() ||
    orgName ||
    base.shopName;

  return {
    ...base,
    shopName: displayName,
    legalName: shop?.legal_name?.trim() || base.legalName,
    tradingName: shop?.trading_name?.trim() || shop?.shop_name?.trim() || displayName,
    supportEmail: shop?.support_email?.trim() || base.supportEmail,
    privacyEmail: shop?.privacy_email?.trim() || base.privacyEmail,
    websiteUrl: shop?.website_url?.trim() || base.websiteUrl,
    address: formatShopAddress(shop) || base.address,
    accentColor: shop?.accent_color?.trim() || base.accentColor,
    tattooDataStorageText: shop?.consent_tattoo_data_storage_text?.trim() || base.tattooDataStorageText,
    piercingDataStorageText: shop?.consent_piercing_data_storage_text?.trim() || base.piercingDataStorageText,
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

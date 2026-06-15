import { supabase } from "@/integrations/supabase/client";
import { currencyForShopCountry, normalizeShopCountryCode } from "@/lib/shopCurrency";
import { fetchIsPlatformAdmin } from "@/lib/platformAdmin";

export interface ShopSettingsRow {
  id: string;
  organization_id: string | null;
  shop_name: string;
  legal_name: string;
  trading_name: string | null;
  support_email: string | null;
  privacy_email: string | null;
  phone: string | null;
  website_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  country: string;
  country_code?: string;
  logo_url: string | null;
  setup_completed_at: string | null;
  owner_is_practitioner: boolean | null;
}

export async function getUserOrganizationId(userId?: string): Promise<string | null> {
  const uid = userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase.rpc("get_user_organization_id", { _user_id: uid });
  if (error || !data) return null;
  return data as string;
}

export async function loadShopSettingsForOrganization(orgId: string): Promise<ShopSettingsRow | null> {
  const { data, error } = await supabase
    .from("shop_settings" as any)
    .select(
      "id, organization_id, shop_name, legal_name, trading_name, support_email, privacy_email, phone, website_url, address_line1, address_line2, city, postcode, country, country_code, logo_url, setup_completed_at, owner_is_practitioner",
    )
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ShopSettingsRow;
}

export async function loadShopSettings(userId?: string): Promise<ShopSettingsRow | null> {
  const orgId = await getUserOrganizationId(userId);
  if (orgId) {
    const { data, error } = await supabase
      .from("shop_settings" as any)
      .select(
        "id, organization_id, shop_name, legal_name, trading_name, support_email, privacy_email, phone, website_url, address_line1, address_line2, city, postcode, country, country_code, logo_url, setup_completed_at, owner_is_practitioner",
      )
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!error && data) return data as ShopSettingsRow;
  }

  const { data, error } = await supabase
    .from("shop_settings" as any)
    .select(
      "id, organization_id, shop_name, legal_name, trading_name, support_email, privacy_email, phone, website_url, address_line1, address_line2, city, postcode, country, country_code, logo_url, setup_completed_at, owner_is_practitioner",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as ShopSettingsRow;
}

export async function saveShopSettings(
  shopId: string,
  patch: Partial<Omit<ShopSettingsRow, "id" | "organization_id">>,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("shop_settings" as any)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", shopId);

  return { error: error?.message ?? null };
}

export async function needsShopSetup(userId: string): Promise<boolean> {
  if (await fetchIsPlatformAdmin(userId)) return false;

  const [{ data: isAdmin }, orgSubActive] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    hasActiveOrganizationSubscription(userId),
  ]);

  if (!isAdmin || !orgSubActive) return false;

  const shop = await loadShopSettings(userId);
  if (!shop) return true;
  return !shop.setup_completed_at;
}

async function hasActiveOrganizationSubscription(userId: string): Promise<boolean> {
  const orgId = await getUserOrganizationId(userId);
  if (!orgId) return false;

  const { data } = await supabase
    .from("platform_subscriptions")
    .select("status")
    .eq("organization_id", orgId)
    .maybeSingle();

  const status = data?.status;
  return status === "trialing" || status === "active" || status === "past_due";
}

export async function completeShopSetup(shopId: string): Promise<{ error: string | null }> {
  return saveShopSettings(shopId, { setup_completed_at: new Date().toISOString() });
}

export type ShopSetupWizardData = {
  shop_name: string;
  trading_name: string;
  legal_name: string;
  logo_url: string;
  support_email: string;
  phone: string;
  website_url: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postcode: string;
  country: string;
  company_name: string;
  company_legal_name: string;
};

export function shopRowToWizardData(
  shop: ShopSettingsRow | null,
  company?: { name: string; legal_name: string } | null,
): ShopSetupWizardData {
  return {
    shop_name: shop?.shop_name ?? "",
    trading_name: shop?.trading_name ?? shop?.shop_name ?? "",
    legal_name: shop?.legal_name ?? "",
    logo_url: shop?.logo_url ?? "",
    support_email: shop?.support_email ?? "",
    phone: shop?.phone ?? "",
    website_url: shop?.website_url ?? "",
    address_line1: shop?.address_line1 ?? "",
    address_line2: shop?.address_line2 ?? "",
    city: shop?.city ?? "",
    postcode: shop?.postcode ?? "",
    country: normalizeShopCountryCode(shop?.country),
    company_name: company?.name ?? shop?.trading_name ?? shop?.shop_name ?? "",
    company_legal_name: company?.legal_name ?? shop?.legal_name ?? "",
  };
}

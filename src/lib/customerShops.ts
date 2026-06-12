import { supabase } from "@/integrations/supabase/client";
import { buildCustomerBookingsOrFilter } from "@/lib/customerBookings";

export type CustomerShop = {
  organizationId: string;
  shopName: string;
  logoUrl: string | null;
  accentColor: string | null;
};

export const CUSTOMER_SHOP_STORAGE_KEY = "velbok-customer-shop-org";

/** Distinct studios this customer is linked to (via bookings or org membership). */
export async function loadCustomerShops(userId: string, email?: string | null): Promise<CustomerShop[]> {
  const orgIds = new Set<string>();

  const { data: bookingRows } = await supabase
    .from("bookings")
    .select("organization_id")
    .not("organization_id", "is", null)
    .or(buildCustomerBookingsOrFilter(userId, email));

  (bookingRows ?? []).forEach((row) => {
    if (row.organization_id) orgIds.add(row.organization_id);
  });

  const { data: memberRows } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId);

  (memberRows ?? []).forEach((row) => orgIds.add(row.organization_id));

  if (orgIds.size === 0) return [];

  const ids = [...orgIds];

  const [{ data: shopRows }, { data: orgRows }] = await Promise.all([
    supabase
      .from("shop_settings" as any)
      .select("organization_id, shop_name, trading_name, logo_url, accent_color")
      .in("organization_id", ids),
    supabase.from("organizations").select("id, name").in("id", ids),
  ]);

  const orgNameById = new Map((orgRows ?? []).map((o) => [o.id, o.name]));
  const shopByOrg = new Map((shopRows ?? []).map((s: any) => [s.organization_id as string, s]));

  return ids
    .map((organizationId) => {
      const shop = shopByOrg.get(organizationId);
      return {
        organizationId,
        shopName:
          (shop?.trading_name as string | null)?.trim() ||
          (shop?.shop_name as string | null)?.trim() ||
          orgNameById.get(organizationId) ||
          "Studio",
        logoUrl: (shop?.logo_url as string | null) ?? null,
        accentColor: (shop?.accent_color as string | null) ?? null,
      };
    })
    .sort((a, b) => a.shopName.localeCompare(b.shopName));
}

export function bookingMatchesCustomerShop(
  organizationId: string | null | undefined,
  selectedOrgId: string | null,
  shopCount: number,
): boolean {
  if (!selectedOrgId || shopCount <= 1) return true;
  if (organizationId === selectedOrgId) return true;
  if (!organizationId) return false;
  return false;
}

export function readStoredCustomerShopOrg(): string | null {
  try {
    return localStorage.getItem(CUSTOMER_SHOP_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredCustomerShopOrg(orgId: string | null): void {
  try {
    if (orgId) localStorage.setItem(CUSTOMER_SHOP_STORAGE_KEY, orgId);
    else localStorage.removeItem(CUSTOMER_SHOP_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

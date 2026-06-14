import { supabase } from "@/integrations/supabase/client";
import { getUserOrganizationId } from "@/lib/shopSettings";
import { computeInvoiceTotals } from "@/lib/orgBilling";

export interface PosLineItem {
  serviceId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ShopPosSettings {
  organization_id: string;
  enabled: boolean;
  shop_split_percent: number;
  artist_split_percent: number;
  gratuity_enabled: boolean;
  default_gratuity_percent: number;
  stripe_terminal_location_id: string | null;
  reader_label: string;
  simulated_reader: boolean;
}

export interface ArtistPosSplit {
  organization_id: string;
  artist_id: string;
  shop_split_percent: number;
  artist_split_percent: number;
  stripe_connect_account_id: string | null;
}

export const defaultShopPosSettings = (): Omit<ShopPosSettings, "organization_id"> => ({
  enabled: false,
  shop_split_percent: 30,
  artist_split_percent: 70,
  gratuity_enabled: true,
  default_gratuity_percent: 0,
  stripe_terminal_location_id: null,
  reader_label: "WisePad",
  simulated_reader: false,
});

export async function loadShopPosSettings(orgId?: string | null): Promise<ShopPosSettings | null> {
  const resolvedOrgId = orgId ?? (await getUserOrganizationId());
  if (!resolvedOrgId) return null;

  const { data, error } = await supabase
    .from("shop_pos_settings" as any)
    .select("*")
    .eq("organization_id", resolvedOrgId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ShopPosSettings;
}

export async function saveShopPosSettings(
  orgId: string,
  patch: Partial<Omit<ShopPosSettings, "organization_id">>,
): Promise<{ error: string | null }> {
  const shopSplit = Number(patch.shop_split_percent ?? 30);
  const artistSplit = 100 - shopSplit;

  const row = {
    organization_id: orgId,
    ...defaultShopPosSettings(),
    ...patch,
    shop_split_percent: shopSplit,
    artist_split_percent: artistSplit,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("shop_pos_settings" as any).upsert(row, {
    onConflict: "organization_id",
  });

  return { error: error?.message ?? null };
}

export async function loadArtistPosSplits(orgId?: string | null): Promise<ArtistPosSplit[]> {
  const resolvedOrgId = orgId ?? (await getUserOrganizationId());
  if (!resolvedOrgId) return [];

  const { data, error } = await supabase
    .from("artist_pos_splits" as any)
    .select("*")
    .eq("organization_id", resolvedOrgId);

  if (error || !data) return [];
  return data as ArtistPosSplit[];
}

export async function saveArtistPosSplit(
  orgId: string,
  artistId: string,
  shopSplitPercent: number,
  stripeConnectAccountId?: string | null,
): Promise<{ error: string | null }> {
  const shop = Math.min(100, Math.max(0, shopSplitPercent));
  const artist = 100 - shop;

  const { error } = await supabase.from("artist_pos_splits" as any).upsert(
    {
      organization_id: orgId,
      artist_id: artistId,
      shop_split_percent: shop,
      artist_split_percent: artist,
      stripe_connect_account_id: stripeConnectAccountId?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,artist_id" },
  );

  return { error: error?.message ?? null };
}

export async function deleteArtistPosSplit(orgId: string, artistId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("artist_pos_splits" as any)
    .delete()
    .eq("organization_id", orgId)
    .eq("artist_id", artistId);

  return { error: error?.message ?? null };
}

export function resolveSplitPercents(
  shopDefaults: Pick<ShopPosSettings, "shop_split_percent" | "artist_split_percent">,
  artistOverride?: Pick<ArtistPosSplit, "shop_split_percent" | "artist_split_percent"> | null,
): { shopPercent: number; artistPercent: number } {
  if (artistOverride) {
    return {
      shopPercent: Number(artistOverride.shop_split_percent),
      artistPercent: Number(artistOverride.artist_split_percent),
    };
  }
  return {
    shopPercent: Number(shopDefaults.shop_split_percent),
    artistPercent: Number(shopDefaults.artist_split_percent),
  };
}

export function computePosTotals(input: {
  lineItems: PosLineItem[];
  taxRate: number;
  pricesIncludeTax: boolean;
  taxExempt: boolean;
  gratuityPercent: number;
  shopPercent: number;
  artistPercent: number;
}): {
  subtotal: number;
  taxAmount: number;
  gratuityAmount: number;
  total: number;
  shopAmount: number;
  artistAmount: number;
} {
  const lineGross = input.lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxRate = input.taxExempt ? 0 : input.taxRate;
  const { subtotal, taxAmount, total: preGratuity } = computeInvoiceTotals(lineGross, taxRate, input.pricesIncludeTax);
  const gratuityAmount =
    input.gratuityPercent > 0 ? Math.round(preGratuity * (input.gratuityPercent / 100) * 100) / 100 : 0;
  const total = Math.round((preGratuity + gratuityAmount) * 100) / 100;
  const shopAmount = Math.round(total * (input.shopPercent / 100) * 100) / 100;
  const artistAmount = Math.round((total - shopAmount) * 100) / 100;

  return { subtotal, taxAmount, gratuityAmount, total, shopAmount, artistAmount };
}

export interface PosSaleRow {
  id: string;
  artist_id: string;
  client_name: string | null;
  total: number;
  currency: string;
  status: string;
  created_at: string;
  shop_amount: number;
  artist_amount: number;
  items: PosLineItem[];
}

export async function loadRecentPosSales(limit = 12): Promise<PosSaleRow[]> {
  const { data, error } = await supabase
    .from("pos_sales" as any)
    .select("id, artist_id, client_name, total, currency, status, created_at, shop_amount, artist_amount, items")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as PosSaleRow[];
}

export function toMinorUnits(amount: number, currency: string): number {
  const zeroDecimal = ["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"];
  if (zeroDecimal.includes(currency.toLowerCase())) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

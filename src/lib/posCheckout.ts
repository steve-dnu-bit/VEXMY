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

export interface PosItemTemplate {
  id: string;
  name: string;
  unit_price: number;
  default_quantity: number;
  use_count: number;
}

export async function loadPosItemTemplates(orgId?: string | null): Promise<PosItemTemplate[]> {
  const resolvedOrgId = orgId ?? (await getUserOrganizationId());
  if (!resolvedOrgId) return [];

  const { data, error } = await supabase
    .from("pos_item_templates" as any)
    .select("id, name, unit_price, default_quantity, use_count")
    .eq("organization_id", resolvedOrgId)
    .order("use_count", { ascending: false })
    .order("name");

  if (error || !data) return [];
  return data as PosItemTemplate[];
}

export async function savePosItemTemplate(
  name: string,
  unitPrice: number,
  defaultQuantity = 1,
  orgId?: string | null,
): Promise<{ error: string | null }> {
  const resolvedOrgId = orgId ?? (await getUserOrganizationId());
  if (!resolvedOrgId) return { error: "Organization not found" };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required" };

  const { error } = await supabase.from("pos_item_templates" as any).upsert(
    {
      organization_id: resolvedOrgId,
      name: trimmed,
      unit_price: unitPrice,
      default_quantity: Math.max(1, defaultQuantity),
    },
    { onConflict: "organization_id,name", ignoreDuplicates: false },
  );

  return { error: error?.message ?? null };
}

export async function recordPosItemUsage(
  items: Array<{ name: string; unitPrice: number; quantity: number }>,
  orgId?: string | null,
): Promise<void> {
  const resolvedOrgId = orgId ?? (await getUserOrganizationId());
  if (!resolvedOrgId || items.length === 0) return;

  const seen = new Set<string>();
  for (const item of items) {
    const name = item.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    await supabase.rpc("bump_pos_item_template_usage" as any, {
      p_org_id: resolvedOrgId,
      p_name: name,
      p_unit_price: item.unitPrice,
      p_default_quantity: Math.max(1, item.quantity),
    });
  }
}

export interface PosBookingPrefill {
  id: string;
  booking_type: string;
  service_category: string | null;
  starts_at: string;
  ends_at: string;
  deposit_paid: boolean | null;
  deposit_amount: number | null;
}

export async function loadBookingForPosPrefill(bookingId: string): Promise<PosBookingPrefill | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_type, service_category, starts_at, ends_at, deposit_paid, deposit_amount")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !data) return null;
  return data as PosBookingPrefill;
}

export function computeDepositCredit(
  sessionTotal: number,
  booking: Pick<PosBookingPrefill, "deposit_paid" | "deposit_amount"> | null,
  linkedBookingId: string | null,
): number {
  if (!linkedBookingId || !booking?.deposit_paid) return 0;
  const deposit = Number(booking.deposit_amount) || 0;
  if (deposit <= 0) return 0;
  return Math.min(Math.round(deposit * 100) / 100, sessionTotal);
}

export function computeAmountDue(sessionTotal: number, depositCredit: number): number {
  return Math.max(0, Math.round((sessionTotal - depositCredit) * 100) / 100);
}

export function splitPosAmount(
  amount: number,
  shopPercent: number,
  _artistPercent: number,
): { shopAmount: number; artistAmount: number } {
  const shopAmount = Math.round(amount * (shopPercent / 100) * 100) / 100;
  const artistAmount = Math.round((amount - shopAmount) * 100) / 100;
  return { shopAmount, artistAmount };
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
  booking_id: string | null;
  total: number;
  session_total: number | null;
  deposit_credit_amount: number;
  currency: string;
  status: string;
  created_at: string;
  shop_amount: number;
  artist_amount: number;
  items: PosLineItem[];
}

export async function loadPosSaleForBooking(bookingId: string): Promise<PosSaleRow | null> {
  const { data, error } = await supabase
    .from("pos_sales" as any)
    .select("id, artist_id, client_name, booking_id, total, session_total, deposit_credit_amount, currency, status, created_at, shop_amount, artist_amount, items")
    .eq("booking_id", bookingId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as PosSaleRow;
}

export async function loadRecentPosSales(limit = 12): Promise<PosSaleRow[]> {
  const { data, error } = await supabase
    .from("pos_sales" as any)
    .select("id, artist_id, client_name, booking_id, total, session_total, deposit_credit_amount, currency, status, created_at, shop_amount, artist_amount, items")
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

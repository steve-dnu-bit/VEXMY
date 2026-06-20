import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { parseCsvRecords } from "@/lib/csvRecords";
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
  const { data, error } = await invokeEdgeFunctionJson<{ ok?: boolean }>("stripe-terminal-pos", {
    action: "save_artist_split",
    artistId,
    shopSplitPercent,
    stripeConnectAccountId: stripeConnectAccountId?.trim() || null,
  });

  if (error) return { error: error.message };
  if (!data?.ok) return { error: "Could not save artist payout settings" };
  return { error: null };
}

export async function deleteArtistPosSplit(orgId: string, artistId: string): Promise<{ error: string | null }> {
  const { data, error } = await invokeEdgeFunctionJson<{ ok?: boolean }>("stripe-terminal-pos", {
    action: "delete_artist_split",
    artistId,
  });

  if (error) return { error: error.message };
  if (!data?.ok) return { error: "Could not clear artist payout settings" };
  return { error: null };
}

export function resolveSplitPercents(
  shopDefaults: Pick<ShopPosSettings, "shop_split_percent" | "artist_split_percent">,
  artistOverride?: Pick<ArtistPosSplit, "shop_split_percent" | "artist_split_percent" | "stripe_connect_account_id"> | null,
): { shopPercent: number; artistPercent: number } {
  if (artistOverride) {
    const shop = Number(artistOverride.shop_split_percent);
    const artist = Number(artistOverride.artist_split_percent);
    const hasConnect = !!artistOverride.stripe_connect_account_id?.trim();
    // Ignore stale rows that zero-out the artist without a Connect account (blocks all splits).
    if (!hasConnect && shop >= 100 && artist <= 0) {
      return {
        shopPercent: Number(shopDefaults.shop_split_percent),
        artistPercent: Number(shopDefaults.artist_split_percent),
      };
    }
    return { shopPercent: shop, artistPercent: artist };
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

export interface PosProductCsvRow {
  name: string;
  unitPrice: number;
  defaultQuantity: number;
}

export const MAX_POS_PRODUCT_IMPORT_ROWS = 500;
const POS_PRODUCT_IMPORT_CHUNK_SIZE = 150;

function headerIndex(headers: string[], candidates: string[]): number {
  return headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));
}

function parseMoneyField(raw: string): number {
  const cleaned = raw.replace(/[£$€,\s]/g, "").trim();
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

export function parsePosProductsFromCsv(raw: string): { rows: PosProductCsvRow[]; error: string | null } {
  const allRows = parseCsvRecords(raw);
  if (allRows.length < 2) {
    return { rows: [], error: "csv_needs_header" };
  }

  const headers = allRows[0].map((h) => h.toLowerCase().trim().replace(/^\uFEFF/, ""));
  const nameIndex = headerIndex(headers, ["name", "product", "item", "description", "title"]);
  const priceIndex = headerIndex(headers, ["price", "unit_price", "unit price", "amount", "cost"]);
  const qtyIndex = headerIndex(headers, ["quantity", "qty", "default_quantity", "units"]);

  if (nameIndex < 0 || priceIndex < 0) {
    return { rows: [], error: "csv_missing_columns" };
  }

  const rows: PosProductCsvRow[] = [];
  for (let i = 1; i < allRows.length; i++) {
    const cols = allRows[i];
    if (!cols || cols.length <= nameIndex) continue;
    const name = (cols[nameIndex] || "").trim();
    if (!name) continue;
    const unitPrice = parseMoneyField(cols[priceIndex] || "");
    if (Number.isNaN(unitPrice) || unitPrice < 0) continue;
    const qtyRaw = qtyIndex >= 0 ? cols[qtyIndex] : "1";
    const defaultQuantity = Math.max(1, parseInt(String(qtyRaw || "1"), 10) || 1);
    rows.push({ name, unitPrice, defaultQuantity });
  }

  if (rows.length === 0) {
    return { rows: [], error: "csv_no_valid_rows" };
  }
  if (rows.length > MAX_POS_PRODUCT_IMPORT_ROWS) {
    return { rows: [], error: "csv_too_many_rows" };
  }

  return { rows, error: null };
}

export async function importPosItemTemplates(
  items: PosProductCsvRow[],
  orgId?: string | null,
): Promise<{ imported: number; error: string | null }> {
  const resolvedOrgId = orgId ?? (await getUserOrganizationId());
  if (!resolvedOrgId) return { imported: 0, error: "Organization not found" };
  if (items.length === 0) return { imported: 0, error: "No items to import" };
  if (items.length > MAX_POS_PRODUCT_IMPORT_ROWS) {
    return { imported: 0, error: `Maximum ${MAX_POS_PRODUCT_IMPORT_ROWS} products per import` };
  }

  const deduped = new Map<string, PosProductCsvRow>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    if (!key) continue;
    deduped.set(key, item);
  }
  const payload = [...deduped.values()].map((item) => ({
    organization_id: resolvedOrgId,
    name: item.name.trim(),
    unit_price: item.unitPrice,
    default_quantity: item.defaultQuantity,
  }));

  let imported = 0;
  for (let i = 0; i < payload.length; i += POS_PRODUCT_IMPORT_CHUNK_SIZE) {
    const chunk = payload.slice(i, i + POS_PRODUCT_IMPORT_CHUNK_SIZE);
    const { error } = await supabase.from("pos_item_templates" as any).upsert(chunk, {
      onConflict: "organization_id,name",
      ignoreDuplicates: false,
    });
    if (error) return { imported, error: error.message };
    imported += chunk.length;
  }

  return { imported, error: null };
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
  client_email: string | null;
}

export async function loadBookingForPosPrefill(bookingId: string): Promise<PosBookingPrefill | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_type, service_category, starts_at, ends_at, deposit_paid, deposit_amount, client_email")
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

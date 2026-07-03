import { format, endOfMonth, parseISO, startOfMonth, subMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { aggregateExpensesForPeriod, type ExpenseCategoryBreakdown } from "@/lib/expenses";
import { loadOrganizationArtists } from "@/lib/organizationMembers";
import { getUserOrganizationId } from "@/lib/shopSettings";

export type SalesReportType = "day" | "month";

export interface SalesReportArtistRow {
  artistId: string;
  artistName: string;
  posCount: number;
  deskTotal: number;
  shopAmount: number;
  artistAmount: number;
}

export interface SalesReportSnapshot {
  posCount: number;
  sessionTotal: number;
  deskTotal: number;
  depositCredit: number;
  shopShare: number;
  artistShare: number;
  taxTotal: number;
  gratuityTotal: number;
  depositsCount: number;
  depositsTotal: number;
  invoicesCount: number;
  invoicesTotal: number;
  grandCollected: number;
  byArtist: SalesReportArtistRow[];
  expensesCount: number;
  expensesTotal: number;
  netProfit: number;
  byExpenseCategory: ExpenseCategoryBreakdown[];
}

export interface ShopSalesReportRow {
  id: string;
  organization_id: string;
  report_type: SalesReportType;
  period_start: string;
  period_end: string;
  currency: string;
  data: SalesReportSnapshot;
  generated_at: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function periodBounds(type: SalesReportType, anchor: Date): { start: Date; end: Date; periodStart: string } {
  if (type === "month") {
    const start = startOfMonth(anchor);
    const end = endOfMonth(anchor);
    return { start, end, periodStart: format(start, "yyyy-MM-dd") };
  }
  const day = format(anchor, "yyyy-MM-dd");
  const start = parseISO(`${day}T00:00:00`);
  const end = parseISO(`${day}T23:59:59.999`);
  return { start, end, periodStart: day };
}

export async function buildSalesReportSnapshot(
  orgId: string,
  type: SalesReportType,
  anchor: Date,
  currency: string,
): Promise<{ periodStart: string; periodEnd: string; snapshot: SalesReportSnapshot }> {
  const { start, end, periodStart } = periodBounds(type, anchor);
  const periodEnd = format(end, "yyyy-MM-dd");
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [posRes, depositsRes, invoicesRes, artistProfiles, expenseAgg] = await Promise.all([
    supabase
      .from("pos_sales" as any)
      .select(
        "artist_id, total, session_total, deposit_credit_amount, shop_amount, artist_amount, tax_amount, gratuity_amount, status, created_at",
      )
      .eq("organization_id", orgId)
      .eq("status", "succeeded")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase
      .from("bookings")
      .select("id, deposit_amount, updated_at")
      .eq("organization_id", orgId)
      .eq("deposit_paid", true)
      .gte("updated_at", startIso)
      .lte("updated_at", endIso),
    supabase
      .from("invoices" as any)
      .select("id, total, paid_at")
      .eq("organization_id", orgId)
      .eq("status", "paid")
      .gte("paid_at", startIso)
      .lte("paid_at", endIso),
    loadOrganizationArtists(orgId),
    aggregateExpensesForPeriod(orgId, startIso, endIso),
  ]);

  const posRows = (posRes.data || []) as Array<{
    artist_id: string;
    total: number;
    session_total: number | null;
    deposit_credit_amount: number | null;
    shop_amount: number;
    artist_amount: number;
    tax_amount: number;
    gratuity_amount: number;
  }>;

  const nameMap = new Map<string, string>();
  artistProfiles.forEach((artist) => {
    nameMap.set(artist.user_id, artist.display_name);
  });

  const byArtistMap = new Map<string, SalesReportArtistRow>();
  let sessionTotal = 0;
  let deskTotal = 0;
  let depositCredit = 0;
  let shopShare = 0;
  let artistShare = 0;
  let taxTotal = 0;
  let gratuityTotal = 0;

  for (const row of posRows) {
    const session = Number(row.session_total ?? row.total) || 0;
    const desk = Number(row.total) || 0;
    const credit = Number(row.deposit_credit_amount) || 0;
    sessionTotal += session;
    deskTotal += desk;
    depositCredit += credit;
    shopShare += Number(row.shop_amount) || 0;
    artistShare += Number(row.artist_amount) || 0;
    taxTotal += Number(row.tax_amount) || 0;
    gratuityTotal += Number(row.gratuity_amount) || 0;

    const existing = byArtistMap.get(row.artist_id);
    if (existing) {
      existing.posCount += 1;
      existing.deskTotal = round2(existing.deskTotal + desk);
      existing.shopAmount = round2(existing.shopAmount + Number(row.shop_amount) || 0);
      existing.artistAmount = round2(existing.artistAmount + Number(row.artist_amount) || 0);
    } else {
      byArtistMap.set(row.artist_id, {
        artistId: row.artist_id,
        artistName: nameMap.get(row.artist_id) || "Artist",
        posCount: 1,
        deskTotal: desk,
        shopAmount: Number(row.shop_amount) || 0,
        artistAmount: Number(row.artist_amount) || 0,
      });
    }
  }

  const depositRows = depositsRes.data || [];
  const depositsTotal = depositRows.reduce((sum, r) => sum + Number(r.deposit_amount || 0), 0);

  const invoiceRows = (invoicesRes.data || []) as Array<{ total: number }>;
  const invoicesTotal = invoiceRows.reduce((sum, r) => sum + Number(r.total || 0), 0);

  const grandCollected = round2(deskTotal + depositsTotal + invoicesTotal);
  const expensesTotal = expenseAgg.total;

  const snapshot: SalesReportSnapshot = {
    posCount: posRows.length,
    sessionTotal: round2(sessionTotal),
    deskTotal: round2(deskTotal),
    depositCredit: round2(depositCredit),
    shopShare: round2(shopShare),
    artistShare: round2(artistShare),
    taxTotal: round2(taxTotal),
    gratuityTotal: round2(gratuityTotal),
    depositsCount: depositRows.length,
    depositsTotal: round2(depositsTotal),
    invoicesCount: invoiceRows.length,
    invoicesTotal: round2(invoicesTotal),
    grandCollected,
    byArtist: Array.from(byArtistMap.values()).sort((a, b) => b.deskTotal - a.deskTotal),
    expensesCount: expenseAgg.count,
    expensesTotal,
    netProfit: round2(grandCollected - expensesTotal),
    byExpenseCategory: expenseAgg.byCategory,
  };

  return { periodStart, periodEnd, snapshot };
}

export async function saveSalesReport(
  orgId: string,
  type: SalesReportType,
  anchor: Date,
  currency: string,
): Promise<ShopSalesReportRow | null> {
  const { periodStart, periodEnd, snapshot } = await buildSalesReportSnapshot(orgId, type, anchor, currency);

  const { data, error } = await supabase
    .from("shop_sales_reports" as any)
    .upsert(
      {
        organization_id: orgId,
        report_type: type,
        period_start: periodStart,
        period_end: periodEnd,
        currency,
        data: snapshot,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,report_type,period_start" },
    )
    .select("*")
    .single();

  if (error || !data) return null;
  return data as ShopSalesReportRow;
}

export async function loadSalesReport(
  orgId: string,
  type: SalesReportType,
  periodStart: string,
): Promise<ShopSalesReportRow | null> {
  const { data, error } = await supabase
    .from("shop_sales_reports" as any)
    .select("*")
    .eq("organization_id", orgId)
    .eq("report_type", type)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (error || !data) return null;
  return data as ShopSalesReportRow;
}

export async function loadRecentSalesReports(
  orgId: string,
  type: SalesReportType,
  limit = 6,
): Promise<ShopSalesReportRow[]> {
  const { data, error } = await supabase
    .from("shop_sales_reports" as any)
    .select("*")
    .eq("organization_id", orgId)
    .eq("report_type", type)
    .order("period_start", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as ShopSalesReportRow[];
}

export async function refreshDashboardSalesReports(currency: string): Promise<{
  today: ShopSalesReportRow | null;
  month: ShopSalesReportRow | null;
}> {
  const orgId = await getUserOrganizationId();
  if (!orgId) return { today: null, month: null };

  const now = new Date();
  const [today, month] = await Promise.all([
    saveSalesReport(orgId, "day", now, currency),
    saveSalesReport(orgId, "month", now, currency),
  ]);

  return { today, month };
}

export function previousMonthAnchor(): Date {
  return subMonths(new Date(), 1);
}

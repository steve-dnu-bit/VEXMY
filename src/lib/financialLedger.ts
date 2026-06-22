import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { loadExpenses } from "@/lib/expenses";

export type LedgerEntryType = "pos" | "deposit" | "invoice" | "expense";

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  date: string;
  description: string;
  amount: number;
  direction: "in" | "out";
  category?: string;
  reference?: string;
}

export interface ProfitLossSummary {
  revenueDesk: number;
  revenueDeposits: number;
  revenueInvoices: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  expensesByCategory: Array<{ name: string; total: number }>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function loadLedgerEntries(
  orgId: string,
  from: string,
  to: string,
): Promise<LedgerEntry[]> {
  const startIso = `${from}T00:00:00.000Z`;
  const endIso = `${to}T23:59:59.999Z`;
  const entries: LedgerEntry[] = [];

  const [posRes, depositsRes, invoicesRes, expenses] = await Promise.all([
    supabase
      .from("pos_sales" as any)
      .select("id, total, created_at, artist_id")
      .eq("organization_id", orgId)
      .eq("status", "succeeded")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase
      .from("bookings")
      .select("id, client_name, deposit_amount, updated_at")
      .eq("organization_id", orgId)
      .eq("deposit_paid", true)
      .gte("updated_at", startIso)
      .lte("updated_at", endIso),
    supabase
      .from("invoices" as any)
      .select("id, invoice_number, client_name, total, paid_at")
      .eq("organization_id", orgId)
      .eq("status", "paid")
      .gte("paid_at", startIso)
      .lte("paid_at", endIso),
    loadExpenses(orgId, { from, to }),
  ]);

  for (const row of posRes.data || []) {
    const amt = Number(row.total) || 0;
    entries.push({
      id: `pos-${row.id}`,
      type: "pos",
      date: row.created_at,
      description: "Desk payment",
      amount: amt,
      direction: "in",
      reference: row.id,
    });
  }

  for (const row of depositsRes.data || []) {
    const amt = Number(row.deposit_amount) || 0;
    entries.push({
      id: `dep-${row.id}`,
      type: "deposit",
      date: row.updated_at,
      description: `Deposit — ${row.client_name}`,
      amount: amt,
      direction: "in",
      reference: row.id,
    });
  }

  for (const row of (invoicesRes.data || []) as Array<{
    id: string;
    invoice_number: string;
    client_name: string;
    total: number;
    paid_at: string;
  }>) {
    const amt = Number(row.total) || 0;
    entries.push({
      id: `inv-${row.id}`,
      type: "invoice",
      date: row.paid_at,
      description: `Invoice ${row.invoice_number} — ${row.client_name}`,
      amount: amt,
      direction: "in",
      reference: row.invoice_number,
    });
  }

  for (const exp of expenses) {
    const amt = Number(exp.amount) || 0;
    entries.push({
      id: `exp-${exp.id}`,
      type: "expense",
      date: `${exp.expense_date}T12:00:00.000Z`,
      description: exp.vendor || exp.category?.name || "Expense",
      amount: amt,
      direction: "out",
      category: exp.category?.name,
      reference: exp.notes || undefined,
    });
  }

  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function buildProfitLossFromSnapshot(
  snapshot: {
    deskTotal: number;
    depositsTotal: number;
    invoicesTotal: number;
    grandCollected: number;
    expensesTotal: number;
    byExpenseCategory: Array<{ categoryName: string; total: number }>;
  },
): ProfitLossSummary {
  const totalRevenue = snapshot.grandCollected;
  const totalExpenses = snapshot.expensesTotal;
  return {
    revenueDesk: snapshot.deskTotal,
    revenueDeposits: snapshot.depositsTotal,
    revenueInvoices: snapshot.invoicesTotal,
    totalRevenue,
    totalExpenses,
    netProfit: round2(totalRevenue - totalExpenses),
    expensesByCategory: snapshot.byExpenseCategory.map((c) => ({
      name: c.categoryName,
      total: c.total,
    })),
  };
}

export function buildLedgerCsv(entries: LedgerEntry[], currency: string): string {
  const header = ["Date", "Type", "Description", "Category", "Direction", "Amount", "Currency", "Reference"];
  const rows = entries.map((e) => [
    format(parseISO(e.date), "yyyy-MM-dd HH:mm"),
    e.type,
    csvEscape(e.description),
    csvEscape(e.category || ""),
    e.direction,
    e.amount.toFixed(2),
    currency,
    csvEscape(e.reference || ""),
  ]);
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function buildProfitLossCsv(summary: ProfitLossSummary, periodLabel: string, currency: string): string {
  const lines = [
    `Profit & Loss Report,${csvEscape(periodLabel)}`,
    `Currency,${currency}`,
    "",
    "Revenue",
    `Desk payments,${summary.revenueDesk.toFixed(2)}`,
    `Deposits,${summary.revenueDeposits.toFixed(2)}`,
    `Invoices,${summary.revenueInvoices.toFixed(2)}`,
    `Total revenue,${summary.totalRevenue.toFixed(2)}`,
    "",
    "Expenses",
    ...summary.expensesByCategory.map((c) => `${csvEscape(c.name)},${c.total.toFixed(2)}`),
    `Total expenses,${summary.totalExpenses.toFixed(2)}`,
    "",
    `Net profit,${summary.netProfit.toFixed(2)}`,
  ];
  return lines.join("\n");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface CashFlowWeek {
  weekStart: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
}

export function aggregateCashFlowByWeek(entries: LedgerEntry[]): CashFlowWeek[] {
  const weekMap = new Map<string, CashFlowWeek>();

  for (const e of entries) {
    const d = parseISO(e.date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() + diff);
    const key = format(weekStart, "yyyy-MM-dd");
    const label = `W/C ${format(weekStart, "d MMM")}`;

    const existing = weekMap.get(key) || { weekStart: key, label, inflow: 0, outflow: 0, net: 0 };
    if (e.direction === "in") {
      existing.inflow = round2(existing.inflow + e.amount);
    } else {
      existing.outflow = round2(existing.outflow + e.amount);
    }
    existing.net = round2(existing.inflow - existing.outflow);
    weekMap.set(key, existing);
  }

  return Array.from(weekMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

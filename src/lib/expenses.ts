import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export interface ExpenseCategory {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  sort_order: number;
  is_default: boolean;
}

export interface ExpenseRow {
  id: string;
  organization_id: string;
  category_id: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  vendor: string | null;
  notes: string | null;
  receipt_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category?: ExpenseCategory | null;
}

export interface ExpenseCategoryBreakdown {
  categoryId: string;
  categoryName: string;
  count: number;
  total: number;
}

const DEFAULT_CATEGORIES: Array<{ name: string; color: string; sort_order: number }> = [
  { name: "Rent", color: "#ef4444", sort_order: 1 },
  { name: "Supplies", color: "#f59e0b", sort_order: 2 },
  { name: "Marketing", color: "#8b5cf6", sort_order: 3 },
  { name: "Utilities", color: "#06b6d4", sort_order: 4 },
  { name: "Insurance", color: "#10b981", sort_order: 5 },
  { name: "Equipment", color: "#3b82f6", sort_order: 6 },
  { name: "Payroll", color: "#ec4899", sort_order: 7 },
  { name: "Other", color: "#6b7280", sort_order: 99 },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function ensureDefaultExpenseCategories(orgId: string): Promise<ExpenseCategory[]> {
  const { data: existing } = await supabase
    .from("expense_categories" as any)
    .select("*")
    .eq("organization_id", orgId)
    .order("sort_order");

  if (existing && existing.length > 0) return existing as ExpenseCategory[];

  const rows = DEFAULT_CATEGORIES.map((c) => ({
    organization_id: orgId,
    name: c.name,
    color: c.color,
    sort_order: c.sort_order,
    is_default: true,
  }));

  const { data, error } = await supabase.from("expense_categories" as any).insert(rows).select("*");
  if (error || !data) return [];
  return data as ExpenseCategory[];
}

export async function loadExpenseCategories(orgId: string): Promise<ExpenseCategory[]> {
  return ensureDefaultExpenseCategories(orgId);
}

export async function loadExpenses(
  orgId: string,
  opts?: { from?: string; to?: string; categoryId?: string; limit?: number },
): Promise<ExpenseRow[]> {
  let query = supabase
    .from("expenses" as any)
    .select("*, category:expense_categories(*)")
    .eq("organization_id", orgId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts?.from) query = query.gte("expense_date", opts.from);
  if (opts?.to) query = query.lte("expense_date", opts.to);
  if (opts?.categoryId) query = query.eq("category_id", opts.categoryId);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error || !data) return [];
  return data as ExpenseRow[];
}

export async function createExpense(
  orgId: string,
  payload: {
    category_id?: string | null;
    amount: number;
    currency: string;
    expense_date: string;
    vendor?: string;
    notes?: string;
    receipt_path?: string;
    created_by?: string;
  },
): Promise<ExpenseRow | null> {
  const { data, error } = await supabase
    .from("expenses" as any)
    .insert({
      organization_id: orgId,
      category_id: payload.category_id || null,
      amount: round2(payload.amount),
      currency: payload.currency,
      expense_date: payload.expense_date,
      vendor: payload.vendor?.trim() || null,
      notes: payload.notes?.trim() || null,
      receipt_path: payload.receipt_path || null,
      created_by: payload.created_by || null,
    })
    .select("*, category:expense_categories(*)")
    .single();

  if (error || !data) return null;
  return data as ExpenseRow;
}

export async function updateExpense(
  id: string,
  payload: Partial<{
    category_id: string | null;
    amount: number;
    expense_date: string;
    vendor: string | null;
    notes: string | null;
    receipt_path: string | null;
  }>,
): Promise<boolean> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.category_id !== undefined) update.category_id = payload.category_id;
  if (payload.amount !== undefined) update.amount = round2(payload.amount);
  if (payload.expense_date !== undefined) update.expense_date = payload.expense_date;
  if (payload.vendor !== undefined) update.vendor = payload.vendor?.trim() || null;
  if (payload.notes !== undefined) update.notes = payload.notes?.trim() || null;
  if (payload.receipt_path !== undefined) update.receipt_path = payload.receipt_path;

  const { error } = await supabase.from("expenses" as any).update(update).eq("id", id);
  return !error;
}

export async function deleteExpense(id: string): Promise<boolean> {
  const { error } = await supabase.from("expenses" as any).delete().eq("id", id);
  return !error;
}

export async function aggregateExpensesForPeriod(
  orgId: string,
  startIso: string,
  endIso: string,
): Promise<{ count: number; total: number; byCategory: ExpenseCategoryBreakdown[] }> {
  const startDate = format(parseISO(startIso), "yyyy-MM-dd");
  const endDate = format(parseISO(endIso), "yyyy-MM-dd");

  const expenses = await loadExpenses(orgId, { from: startDate, to: endDate });
  const byCategoryMap = new Map<string, ExpenseCategoryBreakdown>();
  let total = 0;

  for (const exp of expenses) {
    const amt = Number(exp.amount) || 0;
    total += amt;
    const catId = exp.category_id || "uncategorized";
    const catName = exp.category?.name || "Uncategorized";
    const existing = byCategoryMap.get(catId);
    if (existing) {
      existing.count += 1;
      existing.total = round2(existing.total + amt);
    } else {
      byCategoryMap.set(catId, { categoryId: catId, categoryName: catName, count: 1, total: amt });
    }
  }

  return {
    count: expenses.length,
    total: round2(total),
    byCategory: Array.from(byCategoryMap.values()).sort((a, b) => b.total - a.total),
  };
}

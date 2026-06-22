import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO, startOfMonth } from "date-fns";
import { Loader2, Pencil, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatShopMoney } from "@/lib/shopCurrency";
import { getUserOrganizationId } from "@/lib/shopSettings";
import { deleteExpense, loadExpenseCategories, loadExpenses, type ExpenseCategory, type ExpenseRow } from "@/lib/expenses";
import CreateExpenseDialog from "@/components/billing/CreateExpenseDialog";
import FinancialReportsDisclaimer from "@/components/billing/FinancialReportsDisclaimer";

interface ExpensesPanelProps {
  currency: string;
  onChanged?: () => void;
}

const ExpensesPanel = ({ currency, onChanged }: ExpensesPanelProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const money = (n: number) => formatShopMoney(n, currency);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const orgId = await getUserOrganizationId();
      if (!orgId) return;
      const [rows, cats] = await Promise.all([
        loadExpenses(orgId, { from: fromDate, to: toDate, limit: 200 }),
        loadExpenseCategories(orgId),
      ]);
      setExpenses(rows);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return expenses;
    return expenses.filter((e) => e.category_id === categoryFilter);
  }, [expenses, categoryFilter]);

  const total = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount), 0), [filtered]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("expenses.confirmDelete"))) return;
    const ok = await deleteExpense(id);
    if (!ok) {
      toast.error(t("expenses.deleteFailed"));
      return;
    }
    toast.success(t("expenses.deleted"));
    void fetchData();
    onChanged?.();
  };

  const handleSaved = () => {
    void fetchData();
    onChanged?.();
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            {t("expenses.title")}
          </CardTitle>
          <CardDescription>{t("expenses.subtitle")}</CardDescription>
        </div>
        <CreateExpenseDialog currency={currency} onSaved={handleSaved} />
      </CardHeader>
      <CardContent className="space-y-4">
        <FinancialReportsDisclaimer compact />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder={t("expenses.category")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("expenses.allCategories")}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-center col-span-2 sm:col-span-1">
            <p className="text-[10px] uppercase text-muted-foreground">{t("expenses.periodTotal")}</p>
            <p className="font-bold text-destructive tabular-nums">{money(total)}</p>
          </div>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{t("expenses.empty")}</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("expenses.date")}</TableHead>
                    <TableHead>{t("expenses.category")}</TableHead>
                    <TableHead>{t("expenses.vendor")}</TableHead>
                    <TableHead>{t("expenses.notes")}</TableHead>
                    <TableHead className="text-right">{t("billing.total")}</TableHead>
                    <TableHead>{t("billing.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell className="text-xs">{format(parseISO(exp.expense_date), "d MMM yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: exp.category?.color || "#6b7280" }} />
                          {exp.category?.name || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>{exp.vendor || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{exp.notes || "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-destructive">−{money(Number(exp.amount))}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <CreateExpenseDialog
                            currency={currency}
                            expense={exp}
                            onSaved={handleSaved}
                            trigger={<Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Pencil className="h-3.5 w-3.5" /></Button>}
                          />
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => void handleDelete(exp.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="md:hidden space-y-2">
              {filtered.map((exp) => (
                <div key={exp.id} className="rounded-lg border p-3 flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{exp.vendor || exp.category?.name}</p>
                    <p className="text-xs text-muted-foreground">{format(parseISO(exp.expense_date), "d MMM yyyy")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-destructive tabular-nums">−{money(Number(exp.amount))}</p>
                    <div className="flex gap-1 justify-end mt-1">
                      <CreateExpenseDialog
                        currency={currency}
                        expense={exp}
                        onSaved={handleSaved}
                        trigger={<Button size="sm" variant="ghost" className="h-7 px-2 text-xs">{t("billing.edit")}</Button>}
                      />
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => void handleDelete(exp.id)}>
                        {t("expenses.delete")}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ExpensesPanel;

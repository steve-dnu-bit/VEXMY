import { useCallback, useEffect, useState } from "react";
import { format, parseISO, startOfMonth } from "date-fns";
import { Download, FileSpreadsheet, Loader2, Printer, Scale } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatShopMoney } from "@/lib/shopCurrency";
import { getUserOrganizationId } from "@/lib/shopSettings";
import {
  aggregateCashFlowByWeek,
  buildLedgerCsv,
  buildProfitLossCsv,
  buildProfitLossFromSnapshot,
  downloadTextFile,
  loadLedgerEntries,
  type LedgerEntry,
} from "@/lib/financialLedger";
import { loadSalesReport, saveSalesReport, type ShopSalesReportRow } from "@/lib/salesReports";
import FinancialReportsDisclaimer from "@/components/billing/FinancialReportsDisclaimer";

interface AccountingPanelProps {
  currency: string;
}

const cashFlowConfig = {
  inflow: { label: "Inflow", color: "hsl(142 71% 45%)" },
  outflow: { label: "Outflow", color: "hsl(0 72% 51%)" },
};

const TYPE_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pos: "default",
  deposit: "secondary",
  invoice: "outline",
  expense: "destructive",
};

const AccountingPanel = ({ currency }: AccountingPanelProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [monthReport, setMonthReport] = useState<ShopSalesReportRow | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  const money = (n: number) => formatShopMoney(n, currency);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const orgId = await getUserOrganizationId();
      if (!orgId) return;
      const monthStart = fromDate.slice(0, 7) + "-01";
      const [report, entries] = await Promise.all([
        loadSalesReport(orgId, "month", monthStart).then(async (r) => {
          if (r) return r;
          return saveSalesReport(orgId, "month", parseISO(monthStart), currency);
        }),
        loadLedgerEntries(orgId, fromDate, toDate),
      ]);
      setMonthReport(report);
      setLedger(entries);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, currency]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const pnl = monthReport
    ? buildProfitLossFromSnapshot({
        deskTotal: monthReport.data.deskTotal,
        depositsTotal: monthReport.data.depositsTotal,
        invoicesTotal: monthReport.data.invoicesTotal,
        grandCollected: monthReport.data.grandCollected,
        expensesTotal: monthReport.data.expensesTotal ?? 0,
        byExpenseCategory: monthReport.data.byExpenseCategory ?? [],
      })
    : null;

  const cashFlowWeeks = aggregateCashFlowByWeek(ledger);

  const periodLabel = `${format(parseISO(fromDate), "d MMM yyyy")} – ${format(parseISO(toDate), "d MMM yyyy")}`;

  const exportLedger = () => {
    const csv = buildLedgerCsv(ledger, currency, t("accounting.disclaimerCsv"));
    downloadTextFile(`velbok-ledger-${fromDate}-${toDate}.csv`, csv);
  };

  const exportPnl = () => {
    if (!pnl) return;
    const csv = buildProfitLossCsv(pnl, periodLabel, currency, t("accounting.disclaimerCsv"));
    downloadTextFile(`velbok-pnl-${fromDate}-${toDate}.csv`, csv);
  };

  const printPnl = () => {
    if (!pnl) return;
    const disclaimer = t("accounting.disclaimerShort")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>P&L ${periodLabel}</title>
      <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{text-align:left}.num{text-align:right}.total{font-weight:bold}.disclaimer{font-size:12px;color:#666;border:1px solid #ddd;padding:12px;margin-bottom:20px;background:#fafafa}</style>
      </head><body>
      <div class="disclaimer">${disclaimer}</div>
      <h1>Profit & Loss</h1><p>${periodLabel}</p>
      <h2>Revenue</h2>
      <table><tr><td>Desk payments</td><td class="num">${money(pnl.revenueDesk)}</td></tr>
      <tr><td>Deposits</td><td class="num">${money(pnl.revenueDeposits)}</td></tr>
      <tr><td>Invoices</td><td class="num">${money(pnl.revenueInvoices)}</td></tr>
      <tr class="total"><td>Total revenue</td><td class="num">${money(pnl.totalRevenue)}</td></tr></table>
      <h2>Expenses</h2>
      <table>${pnl.expensesByCategory.map((c) => `<tr><td>${c.name}</td><td class="num">${money(c.total)}</td></tr>`).join("")}
      <tr class="total"><td>Total expenses</td><td class="num">${money(pnl.totalExpenses)}</td></tr></table>
      <h2>Net profit: ${money(pnl.netProfit)}</h2>
      </body></html>`);
    w.document.close();
    w.print();
  };

  if (loading && !pnl) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" id="accounting-panel">
      <FinancialReportsDisclaimer />
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                {t("accounting.title")}
              </CardTitle>
              <CardDescription>{t("accounting.subtitle")}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={exportLedger}>
                <Download className="h-3.5 w-3.5" />
                {t("accounting.exportLedger")}
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={exportPnl}>
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {t("accounting.exportPnl")}
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={printPnl}>
                <Printer className="h-3.5 w-3.5" />
                {t("accounting.printPnl")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">{t("accounting.from")}</Label>
              <Input type="date" className="mt-1 w-auto" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("accounting.to")}</Label>
              <Input type="date" className="mt-1 w-auto" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <Button variant="secondary" size="sm" onClick={() => void loadData()}>{t("accounting.apply")}</Button>
          </div>

          {pnl ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <PnlMetric label={t("accounting.totalRevenue")} value={money(pnl.totalRevenue)} tone="emerald" />
              <PnlMetric label={t("accounting.totalExpenses")} value={money(pnl.totalExpenses)} tone="red" />
              <PnlMetric
                label={t("accounting.netProfit")}
                value={money(pnl.netProfit)}
                tone={pnl.netProfit >= 0 ? "emerald" : "red"}
              />
              <PnlMetric label={t("accounting.margin")} value={`${pnl.totalRevenue > 0 ? ((pnl.netProfit / pnl.totalRevenue) * 100).toFixed(1) : "0"}%`} tone="neutral" />
            </div>
          ) : null}

          {pnl ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">{t("accounting.revenueBreakdown")}</p>
                <PnlRow label={t("salesReports.deskPayments")} value={money(pnl.revenueDesk)} />
                <PnlRow label={t("salesReports.deposits")} value={money(pnl.revenueDeposits)} />
                <PnlRow label={t("salesReports.invoices")} value={money(pnl.revenueInvoices)} />
                <PnlRow label={t("accounting.totalRevenue")} value={money(pnl.totalRevenue)} bold />
              </div>
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">{t("accounting.expenseBreakdown")}</p>
                {pnl.expensesByCategory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("expenses.empty")}</p>
                ) : (
                  pnl.expensesByCategory.map((c) => <PnlRow key={c.name} label={c.name} value={money(c.total)} />)
                )}
                <PnlRow label={t("accounting.totalExpenses")} value={money(pnl.totalExpenses)} bold />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {cashFlowWeeks.length > 1 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("accounting.cashFlow")}</CardTitle>
            <CardDescription>{t("accounting.cashFlowHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={cashFlowConfig} className="h-[200px] w-full aspect-auto">
              <BarChart data={cashFlowWeeks} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => money(v)} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => money(Number(v))} />} />
                <Bar dataKey="inflow" fill="var(--color-inflow)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflow" fill="var(--color-outflow)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("accounting.ledger")}</CardTitle>
          <CardDescription>{t("accounting.ledgerHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("accounting.ledgerEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("expenses.date")}</TableHead>
                    <TableHead>{t("accounting.typeColumn")}</TableHead>
                    <TableHead>{t("expenses.notes")}</TableHead>
                    <TableHead className="text-right">{t("billing.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.slice(0, 100).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs whitespace-nowrap">{format(parseISO(e.date), "d MMM yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={TYPE_BADGE[e.type] || "outline"} className="text-[10px] capitalize">
                          {t(`accounting.type.${e.type}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate">{e.description}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${e.direction === "in" ? "text-emerald-400" : "text-destructive"}`}>
                        {e.direction === "in" ? "+" : "−"}{money(e.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {ledger.length > 100 ? (
                <p className="text-xs text-muted-foreground mt-2">{t("accounting.ledgerTruncated", { count: ledger.length })}</p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const PnlMetric = ({ label, value, tone }: { label: string; value: string; tone: "emerald" | "red" | "neutral" }) => {
  const tones = {
    emerald: "border-emerald-500/30 bg-emerald-500/10",
    red: "border-destructive/30 bg-destructive/10",
    neutral: "border-border bg-secondary/30",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-bold mt-1 tabular-nums">{value}</p>
    </div>
  );
};

const PnlRow = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className={`flex justify-between text-sm gap-2 ${bold ? "font-semibold pt-1 border-t" : ""}`}>
    <span className="text-muted-foreground">{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

export default AccountingPanel;

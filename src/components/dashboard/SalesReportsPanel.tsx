import { useCallback, useEffect, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { useTranslation } from "react-i18next";
import { BarChart3, CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatShopMoney } from "@/lib/shopCurrency";
import { getUserOrganizationId } from "@/lib/shopSettings";
import FinancialCharts from "@/components/billing/FinancialCharts";
import {
  loadRecentSalesReports,
  loadSalesReport,
  refreshDashboardSalesReports,
  saveSalesReport,
  type ShopSalesReportRow,
} from "@/lib/salesReports";

interface SalesReportsPanelProps {
  currency: string;
  showCharts?: boolean;
}

const SalesReportsPanel = ({ currency, showCharts = true }: SalesReportsPanelProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dayReport, setDayReport] = useState<ShopSalesReportRow | null>(null);
  const [monthReport, setMonthReport] = useState<ShopSalesReportRow | null>(null);
  const [pastDays, setPastDays] = useState<ShopSalesReportRow[]>([]);
  const [pastMonths, setPastMonths] = useState<ShopSalesReportRow[]>([]);
  const [chartDays, setChartDays] = useState<ShopSalesReportRow[]>([]);
  const [chartMonths, setChartMonths] = useState<ShopSalesReportRow[]>([]);
  const [dayPicker, setDayPicker] = useState(format(new Date(), "yyyy-MM-dd"));

  const money = (amount: number) => formatShopMoney(amount, currency);

  const loadChartData = useCallback(async (orgId: string) => {
    const [days, months] = await Promise.all([
      loadRecentSalesReports(orgId, "day", 30),
      loadRecentSalesReports(orgId, "month", 12),
    ]);
    setChartDays(days);
    setChartMonths(months);
  }, []);

  const loadAll = async (refreshCurrent = false) => {
    setLoading(true);
    try {
      const orgId = await getUserOrganizationId();
      if (!orgId) return;

      if (refreshCurrent) {
        setRefreshing(true);
        const { today, month } = await refreshDashboardSalesReports(currency);
        setDayReport(today);
        setMonthReport(month);
        await loadChartData(orgId);
      } else {
        const todayStr = format(new Date(), "yyyy-MM-dd");
        const monthStr = format(new Date(), "yyyy-MM-01");
        const [today, month, days, months] = await Promise.all([
          loadSalesReport(orgId, "day", todayStr),
          loadSalesReport(orgId, "month", monthStr),
          loadRecentSalesReports(orgId, "day", 7),
          loadRecentSalesReports(orgId, "month", 6),
        ]);
        setDayReport(today);
        setMonthReport(month);
        setPastDays(days.filter((r) => r.period_start !== todayStr));
        setPastMonths(months.filter((r) => r.period_start !== monthStr));
        await loadChartData(orgId);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAll(true);
  }, [currency]);

  const loadDayByDate = async () => {
    setRefreshing(true);
    try {
      const orgId = await getUserOrganizationId();
      if (!orgId) return;
      const anchor = parseISO(dayPicker);
      const isToday = dayPicker === format(new Date(), "yyyy-MM-dd");
      const row = isToday
        ? (await refreshDashboardSalesReports(currency)).today
        : await saveSalesReport(orgId, "day", anchor, currency);
      setDayReport(row);
      if (isToday) {
        const days = await loadRecentSalesReports(orgId, "day", 7);
        setPastDays(days.filter((r) => r.period_start !== dayPicker));
      }
      await loadChartData(orgId);
    } finally {
      setRefreshing(false);
    }
  };

  const expenseCategories = (monthReport?.data.byExpenseCategory ?? []).map((c) => ({
    name: c.categoryName,
    total: c.total,
  }));

  const artistBreakdown = (monthReport?.data.byArtist ?? []).map((a) => ({
    name: a.artistName,
    value: a.deskTotal,
  }));

  const ReportMetrics = ({ report }: { report: ShopSalesReportRow }) => {
    const d = report.data;
    const expensesTotal = d.expensesTotal ?? 0;
    const netProfit = d.netProfit ?? d.grandCollected - expensesTotal;
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {t("salesReports.savedAt", { time: format(parseISO(report.generated_at), "d MMM yyyy, HH:mm") })}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Metric label={t("salesReports.deskPayments")} value={money(d.deskTotal)} sub={`${d.posCount} ${t("salesReports.payments")}`} tone="blue" />
          <Metric label={t("salesReports.deposits")} value={money(d.depositsTotal)} sub={`${d.depositsCount} ${t("salesReports.payments")}`} tone="amber" />
          <Metric label={t("salesReports.invoices")} value={money(d.invoicesTotal)} sub={`${d.invoicesCount} ${t("salesReports.paid")}`} tone="violet" />
          <Metric label={t("salesReports.totalCollected")} value={money(d.grandCollected)} sub={t("salesReports.totalCollectedHint")} tone="gold" />
          <Metric label={t("accounting.totalExpenses")} value={money(expensesTotal)} sub={`${d.expensesCount ?? 0} ${t("expenses.items")}`} tone="red" />
          <Metric label={t("accounting.netProfit")} value={money(netProfit)} sub={t("accounting.netProfitHint")} tone={netProfit >= 0 ? "green" : "red"} />
        </div>
        {d.posCount > 0 ? (
          <div className="rounded-lg border border-border/60 bg-secondary/25 backdrop-blur-sm p-3 space-y-2 text-sm">
            <p className="font-medium">{t("salesReports.posBreakdown")}</p>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <Row label={t("salesReports.sessionValue")} value={money(d.sessionTotal)} />
              <Row label={t("salesReports.depositCredit")} value={`−${money(d.depositCredit)}`} />
              <Row label={t("salesReports.shopShare")} value={money(d.shopShare)} />
              <Row label={t("salesReports.artistShare")} value={money(d.artistShare)} />
              {d.gratuityTotal > 0 ? <Row label={t("pos.gratuity")} value={money(d.gratuityTotal)} /> : null}
              {d.taxTotal > 0 ? <Row label={t("salesReports.tax")} value={money(d.taxTotal)} /> : null}
            </div>
            {d.byArtist.length > 0 ? (
              <div className="pt-2 border-t border-border/60">
                <p className="text-xs font-medium mb-2">{t("salesReports.byArtist")}</p>
                <div className="space-y-1">
                  {d.byArtist.map((a) => (
                    <div key={a.artistId} className="flex justify-between text-xs gap-2">
                      <span className="truncate">{a.artistName}</span>
                      <span className="tabular-nums shrink-0">{money(a.deskTotal)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {(d.byExpenseCategory ?? []).length > 0 ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1 text-sm">
            <p className="font-medium text-sm">{t("accounting.expenseBreakdown")}</p>
            {d.byExpenseCategory!.map((c) => (
              <div key={c.categoryId} className="flex justify-between text-xs gap-2">
                <span>{c.categoryName}</span>
                <span className="tabular-nums text-destructive">−{money(c.total)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  if (loading && !dayReport && !monthReport) {
    return (
      <Card className="mt-6">
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {showCharts && (chartDays.length > 0 || chartMonths.length > 0) ? (
        <FinancialCharts
          currency={currency}
          dailyReports={chartDays}
          monthlyReports={chartMonths}
          expenseCategories={expenseCategories}
          artistBreakdown={artistBreakdown}
        />
      ) : null}

      <Card className={showCharts ? "" : "mt-6"}>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                {t("salesReports.title")}
              </CardTitle>
              <CardDescription>{t("salesReports.subtitle")}</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => void loadAll(true)}
              className="gap-2 shrink-0"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("salesReports.refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="day">
            <TabsList className="mb-4">
              <TabsTrigger value="day">{t("salesReports.endOfDay")}</TabsTrigger>
              <TabsTrigger value="month">{t("salesReports.endOfMonth")}</TabsTrigger>
            </TabsList>

            <TabsContent value="day" className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label htmlFor="report-day" className="text-xs">
                    {t("salesReports.pickDay")}
                  </Label>
                  <Input
                    id="report-day"
                    type="date"
                    className="mt-1 w-auto bg-secondary"
                    value={dayPicker}
                    max={format(new Date(), "yyyy-MM-dd")}
                    min={format(subDays(new Date(), 365), "yyyy-MM-dd")}
                    onChange={(e) => setDayPicker(e.target.value)}
                  />
                </div>
                <Button type="button" variant="secondary" size="sm" disabled={refreshing} onClick={() => void loadDayByDate()}>
                  {t("salesReports.loadDay")}
                </Button>
              </div>
              {dayReport ? (
                <ReportMetrics report={dayReport} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("salesReports.noReportYet")}</p>
              )}
              {pastDays.length > 0 ? (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {t("salesReports.savedDays")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pastDays.map((r) => (
                      <Button
                        key={r.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                        onClick={() => {
                          setDayPicker(r.period_start);
                          setDayReport(r);
                        }}
                      >
                        {format(parseISO(r.period_start), "d MMM")} · {money(r.data.grandCollected)}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="month" className="space-y-4">
              {monthReport ? (
                <ReportMetrics report={monthReport} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("salesReports.noReportYet")}</p>
              )}
              {pastMonths.length > 0 ? (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t("salesReports.savedMonths")}</p>
                  <div className="flex flex-wrap gap-2">
                    {pastMonths.map((r) => (
                      <Button
                        key={r.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                        onClick={() => setMonthReport(r)}
                      >
                        {format(parseISO(r.period_start), "MMM yyyy")} · {money(r.data.grandCollected)}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

const METRIC_TONES = {
  blue: "border-blue-500/30 bg-blue-500/10",
  amber: "border-amber-500/30 bg-amber-500/10",
  violet: "border-violet-500/30 bg-violet-500/10",
  gold: "border-primary/40 bg-primary/10",
  red: "border-destructive/30 bg-destructive/10",
  green: "border-emerald-500/30 bg-emerald-500/10",
} as const;

const Metric = ({
  label,
  value,
  sub,
  tone = "blue",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: keyof typeof METRIC_TONES;
}) => (
  <div className={`rounded-lg border p-3 backdrop-blur-sm ${METRIC_TONES[tone]}`}>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="font-display text-xl font-bold mt-1 tabular-nums">{value}</p>
    <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
  </div>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-2">
    <span className="text-muted-foreground">{label}</span>
    <span className="tabular-nums font-medium">{value}</span>
  </div>
);

export default SalesReportsPanel;

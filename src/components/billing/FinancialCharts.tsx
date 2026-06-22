import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { formatShopMoney } from "@/lib/shopCurrency";
import type { ShopSalesReportRow } from "@/lib/salesReports";

interface FinancialChartsProps {
  currency: string;
  dailyReports: ShopSalesReportRow[];
  monthlyReports: ShopSalesReportRow[];
  expenseCategories?: Array<{ name: string; total: number; color?: string }>;
}

const chartConfig = {
  revenue: { label: "Revenue", color: "hsl(var(--primary))" },
  expenses: { label: "Expenses", color: "hsl(0 72% 51%)" },
  netProfit: { label: "Net profit", color: "hsl(142 71% 45%)" },
  desk: { label: "Desk", color: "hsl(217 91% 60%)" },
  deposits: { label: "Deposits", color: "hsl(38 92% 50%)" },
  invoices: { label: "Invoices", color: "hsl(262 83% 58%)" },
};

const PIE_COLORS = ["#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4", "#10b981", "#3b82f6", "#ec4899", "#6b7280"];

const FinancialCharts = ({ currency, dailyReports, monthlyReports, expenseCategories = [] }: FinancialChartsProps) => {
  const { t } = useTranslation();
  const money = (n: number) => formatShopMoney(n, currency);

  const dailyData = useMemo(() => {
    return [...dailyReports]
      .sort((a, b) => a.period_start.localeCompare(b.period_start))
      .map((r) => ({
        label: format(parseISO(r.period_start), "d MMM"),
        revenue: r.data.grandCollected,
        expenses: r.data.expensesTotal ?? 0,
        netProfit: r.data.netProfit ?? r.data.grandCollected,
      }));
  }, [dailyReports]);

  const monthlyData = useMemo(() => {
    return [...monthlyReports]
      .sort((a, b) => a.period_start.localeCompare(b.period_start))
      .map((r) => ({
        label: format(parseISO(r.period_start), "MMM yy"),
        revenue: r.data.grandCollected,
        expenses: r.data.expensesTotal ?? 0,
        netProfit: r.data.netProfit ?? r.data.grandCollected,
        desk: r.data.deskTotal,
        deposits: r.data.depositsTotal,
        invoices: r.data.invoicesTotal,
      }));
  }, [monthlyReports]);

  const revenueSourceData = useMemo(() => {
    if (monthlyData.length === 0) return [];
    const latest = monthlyData[monthlyData.length - 1];
    return [
      { name: "desk", value: latest.desk, fill: "var(--color-desk)" },
      { name: "deposits", value: latest.deposits, fill: "var(--color-deposits)" },
      { name: "invoices", value: latest.invoices, fill: "var(--color-invoices)" },
    ].filter((d) => d.value > 0);
  }, [monthlyData]);

  const expensePieData = useMemo(() => {
    return expenseCategories.filter((c) => c.total > 0).map((c, i) => ({
      name: c.name,
      value: c.total,
      fill: c.color || PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [expenseCategories]);

  if (dailyData.length === 0 && monthlyData.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {dailyData.length > 1 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("accounting.dailyRevenueChart")}</CardTitle>
            <CardDescription>{t("accounting.dailyRevenueChartHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[220px] w-full aspect-auto">
              <LineChart data={dailyData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => money(v)} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => money(Number(v))} />} />
                <Line type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expenses" stroke="var(--color-expenses)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}

      {monthlyData.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("accounting.monthlyChart")}</CardTitle>
            <CardDescription>{t("accounting.monthlyChartHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[220px] w-full aspect-auto">
              <BarChart data={monthlyData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => money(v)} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => money(Number(v))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="netProfit" fill="var(--color-netProfit)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}

      {revenueSourceData.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("accounting.revenueSources")}</CardTitle>
            <CardDescription>{t("accounting.revenueSourcesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[220px] w-full aspect-auto">
              <BarChart data={revenueSourceData} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => money(v)} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={72} tickFormatter={(v) => t(`accounting.source.${v}`)} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => money(Number(v))} />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {revenueSourceData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}

      {expensePieData.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("accounting.expenseBreakdown")}</CardTitle>
            <CardDescription>{t("accounting.expenseBreakdownHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[220px] w-full aspect-auto">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => money(Number(v))} />} />
                <Pie data={expensePieData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                  {expensePieData.map((entry, i) => (
                    <Cell key={entry.name} fill={entry.fill || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {expensePieData.map((c) => (
                <span key={c.name} className="text-xs text-muted-foreground">
                  {c.name}: {money(c.value)}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default FinancialCharts;

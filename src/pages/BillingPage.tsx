import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { format, parseISO, isBefore } from "date-fns";
import { Building2, AlertCircle, PoundSterling, TrendingUp, CheckCircle2, XCircle, FileText } from "lucide-react";
import CreateInvoiceDialog from "@/components/billing/CreateInvoiceDialog";
import EditInvoiceDialog from "@/components/billing/EditInvoiceDialog";
import BillingSettingsCard from "@/components/billing/BillingSettingsCard";
import PosSalesCard from "@/components/billing/PosSalesCard";
import SalesReportsPanel from "@/components/dashboard/SalesReportsPanel";
import ExpensesPanel from "@/components/billing/ExpensesPanel";
import AccountingPanel from "@/components/billing/AccountingPanel";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { refreshDashboardSalesReports } from "@/lib/salesReports";
import { toast } from "sonner";
import SubscriptionGate from "@/components/subscription/SubscriptionGate";
import StripeConnectCard from "@/components/subscription/StripeConnectCard";
import { useTranslation } from "react-i18next";
import { loadOrgBillingContext } from "@/lib/orgBilling";
import { formatShopMoney } from "@/lib/shopCurrency";

interface Company {
  id: string;
  name: string;
  legal_name: string;
  stripe_account_id: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string | null;
  company_id: string | null;
  subtotal: number;
  tax_amount: number;
  payment_method: string | null;
  payment_term: string | null;
  notes: string | null;
  items: unknown;
  total: number;
  currency?: string | null;
  tax_label?: string | null;
  tax_rate?: number | null;
  prices_include_tax?: boolean | null;
  status: string;
  due_date: string | null;
  created_at: string;
  stripe_checkout_url?: string | null;
}

const BillingPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<"all" | "draft" | "sent" | "paid">("all");
  const [invoiceFromDate, setInvoiceFromDate] = useState("");
  const [invoiceToDate, setInvoiceToDate] = useState("");
  const [shopCurrency, setShopCurrency] = useState("gbp");
  const [reportVersion, setReportVersion] = useState(0);

  const handleFinancialChange = () => {
    setReportVersion((v) => v + 1);
    void refreshDashboardSalesReports(shopCurrency);
  };

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const [adminRes, companiesRes, invoicesRes, billingCtx] = await Promise.all([
        supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
        supabase.from("companies").select("*"),
        supabase.from("invoices" as any).select("id, invoice_number, client_name, client_email, company_id, subtotal, tax_amount, tax_rate, tax_label, currency, prices_include_tax, payment_method, payment_term, notes, items, total, status, due_date, created_at, stripe_checkout_url").order("created_at", { ascending: false }),
        loadOrgBillingContext(),
      ]);
      setIsAdmin(!!adminRes.data);
      setShopCurrency(billingCtx.currency);
      if (companiesRes.data) setCompanies(companiesRes.data);
      if (invoicesRes.data) setInvoices(invoicesRes.data as any);
      setLoading(false);
    };
    init();
  }, [user]);

  const fetchInvoices = async () => {
    const { data } = await supabase.from("invoices" as any).select("id, invoice_number, client_name, client_email, company_id, subtotal, tax_amount, tax_rate, tax_label, currency, prices_include_tax, payment_method, payment_term, notes, items, total, status, due_date, created_at, stripe_checkout_url").order("created_at", { ascending: false });
    if (data) setInvoices(data as any);
  };

  const handleResendInvoice = async (invoiceId: string) => {
    const { data, error } = await invokeEdgeFunctionJson("send-invoice", { invoiceId, action: "send" });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || t("billing.failedResend"));
      return;
    }
    const emailSent = !!(data as any)?.emailSent;
    const emailError = ((data as any)?.emailError as string | null | undefined) ?? null;
    if (!emailSent) {
      toast.error(t("billing.emailNotSent", { reason: emailError || t("billing.genericUnknownEmailError", { defaultValue: "Unknown email delivery error" }) }));
      return;
    }
    toast.success(t("billing.invoiceResent"));
    fetchInvoices();
  };

  const handleDownloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
    const { data, error } = await invokeEdgeFunctionJson("send-invoice", { invoiceId, action: "pdf" });
    if (error || !(data as any)?.pdfBase64) {
      toast.error((data as any)?.error || error?.message || t("billing.failedGeneratePdf"));
      return;
    }
    const base64 = (data as any).pdfBase64 as string;
    const filename = ((data as any).filename as string | undefined) || `${invoiceNumber}.pdf`;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleInvoiceStatus = async (id: string, status: string) => {
    const update: any = { status };
    if (status === "paid") update.paid_at = new Date().toISOString();
    const { error } = await supabase.from("invoices" as any).update(update).eq("id", id);
    if (error) { toast.error(t("billing.failedUpdateInvoice")); return; }
    toast.success(t("billing.invoiceMarkedAs", { status }));
    fetchInvoices();
  };

  const handleCreateInvoicePayLink = async (invoiceId: string) => {
    const { data, error } = await invokeEdgeFunctionJson("create-stripe-checkout", { type: "invoice", invoiceId });
    if (error || !(data as any)?.checkoutUrl) {
      const code = (data as any)?.code as string | undefined;
      toast.error(
        code === "connect_required"
          ? t("billing.connectRequired")
          : (data as any)?.error || error?.message || t("billing.failedCreatePaymentLink"),
      );
      return;
    }
    const checkoutUrl = (data as any).checkoutUrl as string;
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      toast.success(t("billing.paymentLinkCopied"));
    } catch {
      toast.success(t("billing.paymentLinkCreated"));
    }
    fetchInvoices();
  };

  const getStats = (sourceInvoices: Invoice[]) => {
    const paid = sourceInvoices.filter((inv) => inv.status === "paid");
    const overdue = sourceInvoices.filter((inv) => {
      if (inv.status === "paid") return false;
      if (!inv.due_date) return false;
      return isBefore(parseISO(inv.due_date), new Date());
    });
    const outstanding = sourceInvoices.filter((inv) => inv.status !== "paid");
    return {
      totalRevenue: paid.reduce((s, inv) => s + Number(inv.total || 0), 0),
      outstanding: outstanding.reduce((s, inv) => s + Number(inv.total || 0), 0),
      paidCount: paid.length,
      unpaidCount: outstanding.length,
      overdueCount: overdue.length,
    };
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const q = invoiceSearch.trim().toLowerCase();
      const matchesSearch =
        q.length === 0 ||
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.client_name.toLowerCase().includes(q) ||
        (inv.client_email || "").toLowerCase().includes(q);

      const matchesStatus = invoiceStatusFilter === "all" ? true : inv.status === invoiceStatusFilter;

      const created = parseISO(inv.created_at);
      const fromOk = invoiceFromDate ? created >= new Date(`${invoiceFromDate}T00:00:00`) : true;
      const toOk = invoiceToDate ? created <= new Date(`${invoiceToDate}T23:59:59`) : true;

      return matchesSearch && matchesStatus && fromOk && toOk;
    });
  }, [invoices, invoiceSearch, invoiceStatusFilter, invoiceFromDate, invoiceToDate]);

  if (!isAdmin && !loading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">{t("billing.adminRequired")}</p>
        </div>
      </AppLayout>
    );
  }

  const allStats = getStats(invoices);
  const fmt = (amount: number, currency?: string | null) => formatShopMoney(amount, currency || shopCurrency);

  return (
    <AppLayout>
      <SubscriptionGate>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">{t("billing.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("billing.subtitle")}</p>
          </div>
          {user && <CreateInvoiceDialog companies={companies} userId={user.id} onCreated={fetchInvoices} />}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs">{t("billing.totalRevenue")}</span>
              </div>
              <p className="text-2xl font-bold text-emerald-400">{fmt(allStats.totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <PoundSterling className="h-4 w-4" />
                <span className="text-xs">{t("billing.outstanding")}</span>
              </div>
              <p className="text-2xl font-bold text-amber-400">{fmt(allStats.outstanding)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs">{t("billing.paid")}</span>
              </div>
              <p className="text-2xl font-bold">{allStats.paidCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <XCircle className="h-4 w-4" />
                <span className="text-xs">{t("billing.overdue")}</span>
              </div>
              <p className="text-2xl font-bold text-destructive">{allStats.overdueCount}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">{t("billing.tabOverview")}</TabsTrigger>
            <TabsTrigger value="invoices">{t("billing.invoicesTitle")}</TabsTrigger>
            <TabsTrigger value="expenses">{t("expenses.title")}</TabsTrigger>
            <TabsTrigger value="accounting">{t("accounting.title")}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-0">
            <SalesReportsPanel key={reportVersion} currency={shopCurrency} />
            <PosSalesCard />
          </TabsContent>

          <TabsContent value="expenses" className="mt-0">
            <ExpensesPanel currency={shopCurrency} onChanged={handleFinancialChange} />
          </TabsContent>

          <TabsContent value="accounting" className="mt-0">
            <AccountingPanel currency={shopCurrency} />
          </TabsContent>

          <TabsContent value="invoices" className="space-y-4 mt-0">
        {/* Per-company breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {companies.map((company) => {
            const stats = getStats(invoices.filter((inv) => inv.company_id === company.id));
            return (
              <Card key={company.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="h-4 w-4 text-primary" />
                    <p className="font-display font-bold">{company.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{company.legal_name}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-emerald-500/10 rounded-md p-2">
                      <p className="text-lg font-bold text-emerald-400">{fmt(stats.totalRevenue)}</p>
                      <p className="text-[10px] text-muted-foreground">{t("billing.collected")}</p>
                    </div>
                    <div className="bg-amber-500/10 rounded-md p-2">
                      <p className="text-lg font-bold text-amber-400">{fmt(stats.outstanding)}</p>
                      <p className="text-[10px] text-muted-foreground">{t("billing.outstanding")}</p>
                    </div>
                    <div className="bg-destructive/10 rounded-md p-2">
                      <p className="text-lg font-bold text-destructive">{stats.overdueCount}</p>
                      <p className="text-[10px] text-muted-foreground">{t("billing.overdue")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Invoices section */}
        <div>
          <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-1">
            <FileText className="h-5 w-5 text-primary" /> {t("billing.invoicesTitle")}
          </h2>
          <p className="text-xs text-muted-foreground mb-3">{t("billing.invoicesSubtitle")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 mb-3">
            <Input
              className="sm:col-span-2 md:col-span-2"
              placeholder={t("billing.searchPlaceholder")}
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
            />
            <Select value={invoiceStatusFilter} onValueChange={(v) => setInvoiceStatusFilter(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder={t("billing.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("billing.allStatuses")}</SelectItem>
                <SelectItem value="draft">{t("billing.statusDraft")}</SelectItem>
                <SelectItem value="sent">{t("billing.statusSent")}</SelectItem>
                <SelectItem value="paid">{t("billing.statusPaid")}</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 md:col-span-2 md:contents">
              <Input type="date" value={invoiceFromDate} onChange={(e) => setInvoiceFromDate(e.target.value)} />
              <Input type="date" value={invoiceToDate} onChange={(e) => setInvoiceToDate(e.target.value)} />
            </div>
          </div>
          {filteredInvoices.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">{t("billing.noInvoicesMatch")}</p>
              </CardContent>
            </Card>
          ) : (
            <>
            <div className="hidden md:block">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table className="min-w-[780px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("billing.invoiceNumber")}</TableHead>
                      <TableHead>{t("billing.client")}</TableHead>
                      <TableHead>{t("billing.company")}</TableHead>
                      <TableHead>{t("billing.total")}</TableHead>
                      <TableHead>{t("billing.dueDate")}</TableHead>
                      <TableHead>{t("billing.created")}</TableHead>
                      <TableHead>{t("billing.status")}</TableHead>
                      <TableHead>{t("billing.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                        <TableCell className="font-medium">{inv.client_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {companies.find(c => c.id === inv.company_id)?.name || "—"}
                        </TableCell>
                        <TableCell className="font-medium">{fmt(Number(inv.total), inv.currency)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {inv.due_date ? format(parseISO(inv.due_date), "d MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(parseISO(inv.created_at), "d MMM yyyy")}</TableCell>
                        <TableCell>
                          <Badge
                            variant={inv.status === "paid" ? "default" : inv.status === "sent" ? "outline" : "secondary"}
                            className="text-[10px] capitalize"
                          >
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            <EditInvoiceDialog
                              invoice={inv}
                              onSaved={fetchInvoices}
                              trigger={<Button size="sm" variant="outline" className="h-7 text-[10px]">{t("billing.edit")}</Button>}
                            />
                            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => handleDownloadInvoice(inv.id, inv.invoice_number)}>
                              {t("billing.download")}
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => handleResendInvoice(inv.id)}>
                              {t("billing.resend")}
                            </Button>
                            {inv.status !== "paid" && (
                              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => handleCreateInvoicePayLink(inv.id)}>
                                {t("billing.copyPayLink")}
                              </Button>
                            )}
                            {inv.status === "draft" && (
                              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => handleInvoiceStatus(inv.id, "sent")}>
                                {t("billing.markSent")}
                              </Button>
                            )}
                            {inv.status !== "paid" && (
                              <Button size="sm" variant="default" className="h-7 text-[10px]" onClick={() => handleInvoiceStatus(inv.id, "paid")}>
                                {t("billing.markPaid")}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            </div>

            <div className="md:hidden space-y-3">
              {filteredInvoices.map((inv) => (
                <Card key={inv.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-muted-foreground">{inv.invoice_number}</p>
                        <p className="font-semibold truncate">{inv.client_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {companies.find(c => c.id === inv.company_id)?.name || "—"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold tabular-nums">{fmt(Number(inv.total), inv.currency)}</p>
                        <Badge
                          variant={inv.status === "paid" ? "default" : inv.status === "sent" ? "outline" : "secondary"}
                          className="text-[10px] capitalize mt-1"
                        >
                          {inv.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        <p className="uppercase tracking-wide text-[10px]">{t("billing.dueDate")}</p>
                        <p className="text-foreground">{inv.due_date ? format(parseISO(inv.due_date), "d MMM yyyy") : "—"}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide text-[10px]">{t("billing.created")}</p>
                        <p className="text-foreground">{format(parseISO(inv.created_at), "d MMM yyyy")}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <EditInvoiceDialog
                        invoice={inv}
                        onSaved={fetchInvoices}
                        trigger={<Button size="sm" variant="outline" className="h-9">{t("billing.edit")}</Button>}
                      />
                      <Button size="sm" variant="outline" className="h-9" onClick={() => handleDownloadInvoice(inv.id, inv.invoice_number)}>
                        {t("billing.download")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-9" onClick={() => handleResendInvoice(inv.id)}>
                        {t("billing.resend")}
                      </Button>
                      {inv.status !== "paid" && (
                        <Button size="sm" variant="outline" className="h-9" onClick={() => handleCreateInvoicePayLink(inv.id)}>
                          {t("billing.copyPayLink")}
                        </Button>
                      )}
                      {inv.status === "draft" && (
                        <Button size="sm" variant="outline" className="h-9" onClick={() => handleInvoiceStatus(inv.id, "sent")}>
                          {t("billing.markSent")}
                        </Button>
                      )}
                      {inv.status !== "paid" && (
                        <Button size="sm" variant="default" className="h-9" onClick={() => handleInvoiceStatus(inv.id, "paid")}>
                          {t("billing.markPaid")}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            </>
          )}
        </div>
          </TabsContent>
        </Tabs>

        <BillingSettingsCard />

        <StripeConnectCard compact returnPath="/billing" refreshPath="/billing" />
      </div>
      </SubscriptionGate>
    </AppLayout>
  );
};

export default BillingPage;

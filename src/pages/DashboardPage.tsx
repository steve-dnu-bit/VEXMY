import { useEffect, useState } from "react";
import { Calendar, Users, MessageSquare, FileSignature, Eye, CreditCard, Receipt, CheckCircle2, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { loadShopSettings } from "@/lib/shopSettings";
import { currencyForShopCountry, formatShopMoney } from "@/lib/shopCurrency";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { getUserOrganizationId } from "@/lib/shopSettings";
import AppLayout from "@/components/AppLayout";
import SalesReportsPanel from "@/components/dashboard/SalesReportsPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DashboardPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { hasFeature } = useSubscription();
  const [bookingCount, setBookingCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [recentPaidInvoices, setRecentPaidInvoices] = useState<
    Array<{
      id: string;
      invoice_number: string;
      client_name: string;
      total: number;
      paid_at: string | null;
      stripe_payment_intent_id: string | null;
      stripe_checkout_session_id: string | null;
    }>
  >([]);
  const [recentPaidDeposits, setRecentPaidDeposits] = useState<
    Array<{
      id: string;
      client_name: string;
      starts_at: string;
      deposit_amount: number | null;
      deposit_payment_id: string | null;
    }>
  >([]);
  const [stripeInvoicePaidCount, setStripeInvoicePaidCount] = useState(0);
  const [stripeInvoicePaidValue, setStripeInvoicePaidValue] = useState(0);
  const [stripeDepositPaidCount, setStripeDepositPaidCount] = useState(0);
  const [shopCurrency, setShopCurrency] = useState("gbp");

  useEffect(() => {
    void loadShopSettings().then((shop) => {
      setShopCurrency(currencyForShopCountry(shop?.country));
    });
  }, []);

  const money = (amount: number) => formatShopMoney(amount, shopCurrency);
  const [recentConsents, setRecentConsents] = useState<
    Array<{
      id: string;
      full_name: string;
      email: string | null;
      phone: string | null;
      created_at: string;
      booking_id: string | null;
      artist_id: string | null;
      consent_pdf_url: string | null;
      bookingStartsAt?: string | null;
      artistName?: string | null;
    }>
  >([]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const today = new Date().toISOString().split("T")[0];

    const { count: bCount } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .gte("starts_at", `${today}T00:00:00`)
      .lt("starts_at", `${today}T23:59:59`);
    setBookingCount(bCount || 0);

    if (hasFeature("staff_inbox")) {
      const orgId = await getUserOrganizationId();
      let ticketQuery = supabase
        .from("support_tickets" as any)
        .select("*", { count: "exact", head: true })
        .eq("status", "open");
      if (orgId) ticketQuery = ticketQuery.eq("organization_id", orgId);
      const { count: mCount } = await ticketQuery;
      setMessageCount(mCount || 0);
    } else {
      const { data: contactBookings } = await supabase
        .from("bookings")
        .select("client_name, client_email, client_phone")
        .limit(500);
      const seen = new Set<string>();
      (contactBookings || []).forEach((b) => {
        if (!b.client_email && !b.client_phone) return;
        seen.add(`${b.client_name}|${b.client_email}|${b.client_phone}`);
      });
      setMessageCount(seen.size);
    }

    const { data: recent } = await supabase
      .from("bookings")
      .select("*")
      .gte("starts_at", `${today}T00:00:00`)
      .order("starts_at")
      .limit(5);
    if (recent) setRecentBookings(recent);

    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: paidInvoices } = await supabase
      .from("invoices" as any)
      .select("id, invoice_number, client_name, total, paid_at, stripe_payment_intent_id, stripe_checkout_session_id")
      .eq("status", "paid")
      .gte("paid_at", thirtyDaysAgoIso)
      .order("paid_at", { ascending: false })
      .limit(10);
    const invoiceRows = (paidInvoices as any[]) || [];
    setRecentPaidInvoices(invoiceRows.slice(0, 5));
    setStripeInvoicePaidCount(invoiceRows.length);
    setStripeInvoicePaidValue(invoiceRows.reduce((sum, row) => sum + Number(row.total || 0), 0));

    const { data: paidDeposits } = await supabase
      .from("bookings")
      .select("id, client_name, starts_at, deposit_amount, deposit_payment_id")
      .eq("deposit_paid", true)
      .not("deposit_payment_id", "is", null)
      .gte("starts_at", thirtyDaysAgoIso)
      .order("starts_at", { ascending: false })
      .limit(10);
    const depositRows = (paidDeposits as any[]) || [];
    setRecentPaidDeposits(depositRows.slice(0, 5));
    setStripeDepositPaidCount(depositRows.length);

    const { data: consents } = await supabase
      .from("consent_signatures")
      .select("id, full_name, email, phone, created_at, booking_id, artist_id, consent_pdf_url")
      .order("created_at", { ascending: false })
      .limit(8);

    if (!consents || consents.length === 0) {
      setRecentConsents([]);
      return;
    }

    const bookingIds = consents.map((c) => c.booking_id).filter(Boolean) as string[];
    const artistIds = consents.map((c) => c.artist_id).filter(Boolean) as string[];

    const { data: bookings } = bookingIds.length
      ? await supabase
          .from("bookings")
          .select("id, starts_at")
          .in("id", bookingIds)
      : { data: [] as Array<{ id: string; starts_at: string }> };

    const { data: artists } = artistIds.length
      ? await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", artistIds)
      : { data: [] as Array<{ user_id: string; display_name: string }> };

    const bookingMap = new Map((bookings ?? []).map((b) => [b.id, b.starts_at]));
    const artistMap = new Map((artists ?? []).map((a) => [a.user_id, a.display_name]));

    setRecentConsents(
      consents.map((c) => ({
        ...c,
        bookingStartsAt: c.booking_id ? bookingMap.get(c.booking_id) ?? null : null,
        artistName: c.artist_id ? artistMap.get(c.artist_id) ?? null : null,
      }))
    );
  };

  const stats = [
    {
      label: t("dashboard.todaysBookings"),
      value: String(bookingCount),
      icon: Calendar,
      cardClass: "border-blue-500/30 bg-blue-500/10",
      iconClass: "bg-blue-500/15 text-blue-400",
    },
    {
      label: hasFeature("staff_inbox") ? t("dashboard.openTickets") : t("dashboard.contactableClients"),
      value: String(messageCount),
      icon: hasFeature("staff_inbox") ? MessageSquare : Users,
      cardClass: hasFeature("staff_inbox")
        ? "border-emerald-500/30 bg-emerald-500/10"
        : "border-violet-500/30 bg-violet-500/10",
      iconClass: hasFeature("staff_inbox")
        ? "bg-emerald-500/15 text-emerald-400"
        : "bg-violet-500/15 text-violet-400",
    },
  ];

  const panelClass = "rounded-xl border border-border/70 bg-card/55 backdrop-blur-md p-5";

  return (
    <AppLayout>
      <div className="p-4 md:p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">
              <span className="text-gold">{t("dashboard.title")}</span>
            </h1>
            <p className="text-sm text-muted-foreground">{t("dashboard.welcome")}</p>
          </div>
          <Button variant="outline" asChild className="shrink-0 self-start sm:self-auto">
            <Link to="/schedule">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("dashboard.backToSchedule")}
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          {stats.map((stat) => (
            <div key={stat.label} className={`rounded-xl border p-5 backdrop-blur-md ${stat.cardClass}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.iconClass}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
              </div>
              <p className="font-display text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className={panelClass}>
          <h2 className="font-display text-lg font-semibold mb-4">{t("dashboard.todaysBookings")}</h2>
          {recentBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("dashboard.noBookingsToday")}</p>
          ) : (
            <div className="space-y-2">
              {recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/35 backdrop-blur-sm p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{b.client_name}</p>
                      <p className="text-xs text-muted-foreground">{b.tattoo_style || b.booking_type}</p>
                    </div>
                  </div>
                  <p className="text-sm font-medium">
                    {new Date(b.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`${panelClass} mt-6`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-display text-lg font-semibold">{t("dashboard.stripeVerification")}</h2>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <CheckCircle2 className="h-4 w-4" />
              {t("dashboard.last30Days")}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 mb-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-sm p-3">
              <div className="flex items-center gap-2 text-xs text-emerald-300/90">
                <Receipt className="h-4 w-4" />
                {t("dashboard.paidInvoices")}
              </div>
              <p className="font-display text-2xl font-bold mt-1">{stripeInvoicePaidCount}</p>
            </div>
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 backdrop-blur-sm p-3">
              <div className="flex items-center gap-2 text-xs text-blue-300/90">
                <CreditCard className="h-4 w-4" />
                {t("dashboard.invoiceValuePaid")}
              </div>
              <p className="font-display text-2xl font-bold mt-1">{money(stripeInvoicePaidValue)}</p>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 backdrop-blur-sm p-3">
              <div className="flex items-center gap-2 text-xs text-amber-300/90">
                <Calendar className="h-4 w-4" />
                {t("dashboard.depositsPaid")}
              </div>
              <p className="font-display text-2xl font-bold mt-1">{stripeDepositPaidCount}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-secondary/25 backdrop-blur-sm p-3">
              <p className="text-sm font-semibold mb-2">{t("dashboard.recentPaidInvoices")}</p>
              {recentPaidInvoices.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("dashboard.noPaidInvoices")}</p>
              ) : (
                <div className="space-y-2">
                  {recentPaidInvoices.map((inv) => (
                    <div key={inv.id} className="rounded-md border border-border/60 bg-card/40 backdrop-blur-sm px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{inv.invoice_number} · {inv.client_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.paid_at ? new Date(inv.paid_at).toLocaleString() : t("dashboard.paid")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{money(Number(inv.total || 0))}</p>
                        <Badge variant={inv.stripe_payment_intent_id ? "default" : "outline"} className="text-[10px]">
                          {inv.stripe_payment_intent_id ? t("dashboard.stripe") : t("dashboard.manual")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/60 bg-secondary/25 backdrop-blur-sm p-3">
              <p className="text-sm font-semibold mb-2">{t("dashboard.recentPaidDeposits")}</p>
              {recentPaidDeposits.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("dashboard.noPaidDeposits")}</p>
              ) : (
                <div className="space-y-2">
                  {recentPaidDeposits.map((dep) => (
                    <div key={dep.id} className="rounded-md border border-border/60 bg-card/40 backdrop-blur-sm px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{dep.client_name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(dep.starts_at).toLocaleString()}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{money(Number(dep.deposit_amount ?? 50))}</p>
                        <Badge
                          variant={dep.deposit_payment_id && !dep.deposit_payment_id.startsWith("manual_") ? "default" : "outline"}
                          className="text-[10px]"
                        >
                          {dep.deposit_payment_id && !dep.deposit_payment_id.startsWith("manual_") ? t("dashboard.stripe") : t("dashboard.manual")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`${panelClass} mt-6`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-display text-lg font-semibold">{t("dashboard.consents")}</h2>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <FileSignature className="h-4 w-4" />
              {t("dashboard.latestSubmissions")}
            </div>
          </div>

          {recentConsents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("dashboard.noConsents")}</p>
          ) : (
            <div className="space-y-2">
              {recentConsents.map((c) => {
                const submitted = new Date(c.created_at);
                const bookingTime = c.bookingStartsAt ? new Date(c.bookingStartsAt) : null;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/35 backdrop-blur-sm p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {bookingTime ? bookingTime.toLocaleDateString() : t("dashboard.booking")} ·{" "}
                        {c.artistName ? c.artistName : t("dashboard.artist")}
                      </p>
                      <p className="text-[11px] text-muted-foreground break-all">
                        {c.email || c.phone || "—"} · {t("dashboard.submitted")} {submitted.toLocaleDateString()}{" "}
                      </p>
                    </div>

                    {c.consent_pdf_url ? (
                      <a href={c.consent_pdf_url} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline" className="h-8">
                          <Eye className="h-4 w-4 mr-2" />
                          {t("dashboard.viewPdf")}
                        </Button>
                      </a>
                    ) : (
                      <div className="text-xs text-muted-foreground whitespace-nowrap">{t("dashboard.pdfPending")}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <SalesReportsPanel currency={shopCurrency} />
      </div>
    </AppLayout>
  );
};

export default DashboardPage;

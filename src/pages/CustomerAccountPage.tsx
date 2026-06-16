import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format, parseISO, startOfDay } from "date-fns";
import CustomerLayout from "@/components/CustomerLayout";
import type { PortalBrandProfile } from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { usePermissions } from "@/hooks/usePermissions";
import { Calendar, MessageSquare, Receipt, Star, User, Moon, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CLIENT_CONDUCT_THRESHOLDS } from "@/lib/clientConduct";
import { useThemePreference } from "@/components/theme/ThemeProvider";
import { bookingEligibleForConsent } from "@/lib/bookingTypes";
import { buildCustomerBookingsOrFilter } from "@/lib/customerBookings";
import { bookingMatchesCustomerShop } from "@/lib/customerShops";
import { useCustomerShop } from "@/hooks/useCustomerShop";
import { useTranslation } from "react-i18next";

type BookingRow = {
  id: string;
  artist_id: string;
  organization_id: string | null;
  client_name: string;
  booking_type: string;
  service_category: string;
  starts_at: string;
  ends_at: string;
  status: string;
  tattoo_style: string | null;
  notes: string | null;
  deposit_paid: boolean | null;
  vip_client: boolean | null;
};

interface InvoiceRow {
  id: string;
  invoice_number: string;
  total: number;
  status: string;
  due_date: string | null;
  booking_id: string | null;
  booking: { organization_id: string | null } | null;
}

interface ClientConductRow {
  no_shows_count: number;
  late_cancellations_count: number;
  reschedules_count: number;
  is_banned: boolean;
  ban_reason: string | null;
}

const CustomerAccountPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { theme, setTheme } = useThemePreference();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { selectedOrgId, shops, hasMultipleShops, loading: shopLoading } = useCustomerShop();
  const [checking, setChecking] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [portalBrand, setPortalBrand] = useState<PortalBrandProfile | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conduct, setConduct] = useState<ClientConductRow | null>(null);

  const loadAccountData = useCallback(async (targetUserId: string) => {
    const loginEmail = (user?.email || "").trim().toLowerCase();
    const { data: rows } = await supabase
      .from("bookings")
      .select("id, artist_id, organization_id, client_name, starts_at, ends_at, status, booking_type, service_category, tattoo_style, notes, deposit_paid, vip_client")
      .or(buildCustomerBookingsOrFilter(targetUserId, loginEmail))
      .order("starts_at", { ascending: true });
    const bookingRows = (rows as BookingRow[]) || [];
    setBookings(bookingRows);

    const { data: invoiceRows } = await supabase
      .from("invoices" as any)
      .select("id, invoice_number, total, status, due_date, booking_id, booking:bookings(organization_id)")
      .eq("client_email", user?.email || "")
      .order("created_at", { ascending: false });
    setInvoices((invoiceRows as InvoiceRow[]) || []);

    const [{ data: conductByUser }, { data: conductByEmail }] = await Promise.all([
      supabase
        .from("client_conduct" as any)
        .select("no_shows_count, late_cancellations_count, reschedules_count, is_banned, ban_reason")
        .eq("client_user_id", targetUserId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("client_conduct" as any)
        .select("no_shows_count, late_cancellations_count, reschedules_count, is_banned, ban_reason")
        .eq("client_email", (user?.email || "").trim().toLowerCase())
        .limit(1)
        .maybeSingle(),
    ]);
    setConduct((conductByUser as ClientConductRow | null) || (conductByEmail as ClientConductRow | null) || null);

    const artistId =
      bookingRows.find((b) => bookingMatchesCustomerShop(b.organization_id, selectedOrgId, shops.length))?.artist_id ??
      bookingRows[0]?.artist_id;
    if (artistId) {
      const { data: brand } = await supabase
        .from("profiles")
        .select(
          "display_name, avatar_url, portal_public_bio, portal_bg_color, portal_bg_image_url, public_contact_email, public_contact_phone, public_instagram",
        )
        .eq("user_id", artistId)
        .maybeSingle();
      setPortalBrand((brand as PortalBrandProfile) || null);
    } else {
      setPortalBrand(null);
    }
  }, [user?.email, selectedOrgId, shops.length]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      if (await fetchHasStaffAccess(user.id)) {
        navigate("/schedule", { replace: true });
        return;
      }
      setChecking(false);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, phone, public_contact_email")
        .eq("user_id", user.id)
        .single();
      if (profile) {
        setFullName(profile.display_name || "");
        setEmail((user.email || "").trim().toLowerCase());
        setPhone(profile.phone || "");
      }
      await loadAccountData(user.id);
    })();
  }, [user, navigate, loadAccountData]);

  useEffect(() => {
    if (!user) return;
    const bookingsChannel = supabase
      .channel(`customer-account-bookings-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        void loadAccountData(user.id);
      })
      .subscribe();
    const invoicesChannel = supabase
      .channel(`customer-account-invoices-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => {
        void loadAccountData(user.id);
      })
      .subscribe();
    const conductChannel = supabase
      .channel(`customer-account-conduct-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_conduct" }, () => {
        void loadAccountData(user.id);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(invoicesChannel);
      supabase.removeChannel(conductChannel);
    };
  }, [user, loadAccountData]);

  useEffect(() => {
    const invoiceStatus = searchParams.get("invoice");
    if (invoiceStatus === "success") {
      toast.success(t("customer.invoicePaymentReceived"));
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("invoice");
        next.delete("invoiceId");
        next.delete("session_id");
        return next;
      }, { replace: true });
    } else if (invoiceStatus === "cancel") {
      toast.info(t("customer.invoicePaymentCancelled"));
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("invoice");
        next.delete("invoiceId");
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const saveProfile = async () => {
    if (!user) return;
    const nextName = fullName.trim();
    const nextEmail = (user.email || "").trim().toLowerCase();
    const nextPhone = phone.trim();
    if (!nextName || !nextPhone || !nextEmail) {
      toast.error(t("customer.completeRequiredFields"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      toast.error(t("customer.invalidInviteEmail"));
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: nextName, phone: nextPhone, public_contact_email: nextEmail })
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success(t("customer.profileUpdated"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("customer.couldNotSave"));
    } finally {
      setSaving(false);
    }
  };

  if (checking || !user || permLoading || shopLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">{t("customer.loadingPortal")}</p>
      </div>
    );
  }

  if (!hasPermission("my_bookings")) {
    return (
      <CustomerLayout portalBrand={portalBrand}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("customer.accessLimited")}</CardTitle>
            <CardDescription>{t("customer.accessLimitedDesc")}</CardDescription>
          </CardHeader>
        </Card>
      </CustomerLayout>
    );
  }

  const shopBookings = bookings.filter((b) =>
    bookingMatchesCustomerShop(b.organization_id, selectedOrgId, shops.length),
  );
  const shopInvoices = invoices.filter((inv) => {
    if (!hasMultipleShops || !selectedOrgId) return true;
    const orgId = inv.booking?.organization_id ?? null;
    return bookingMatchesCustomerShop(orgId, selectedOrgId, shops.length);
  });

  const todayStart = startOfDay(new Date());
  const upcoming = shopBookings.filter((b) => parseISO(b.starts_at) >= todayStart);
  const past = shopBookings
    .filter((b) => parseISO(b.starts_at) < todayStart)
    .sort((a, b) => parseISO(b.starts_at).getTime() - parseISO(a.starts_at).getTime());

  const unpaidDepositUpcoming = upcoming.filter((b) => !b.deposit_paid);
  const isVipClient = shopBookings.some((b) => b.vip_client);
  const unpaidInvoices = shopInvoices.filter((inv) => inv.status !== "paid");

  return (
    <CustomerLayout portalBrand={portalBrand}>
      <div className="space-y-8">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-gold">{t("customer.myAccountTitle")}</h1>
            {isVipClient ? (
              <Badge className="gap-1 bg-yellow-500/15 text-yellow-200 border-yellow-500/35 font-medium">
                <Star className="h-3 w-3 fill-yellow-400/80 text-yellow-300" />
                VIP
              </Badge>
            ) : null}
          </div>
            <p className="text-sm text-muted-foreground mt-1">{t("customer.profileAppointments")}</p>
        </div>

        <Card className="border-primary/35 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{t("customer.contactCardTitle")}</CardTitle>
            </div>
            <CardDescription>{t("customer.contactCardDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button variant="gold" className="w-full sm:w-auto" onClick={() => navigate("/account/tickets")}>
              {t("tickets.raiseTicket")}
            </Button>
          </CardContent>
        </Card>

        {unpaidDepositUpcoming.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("customer.depositCardTitle")}</CardTitle>
              <CardDescription>
              {t("customer.depositCardDesc")}
            </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {unpaidDepositUpcoming.slice(0, 3).map((b) => (
                <div key={b.id} className="rounded-lg border border-border p-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{format(parseISO(b.starts_at), "EEE d MMM yyyy, h:mm a")}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.booking_type}</p>
                  </div>
                  {b.vip_client ? (
                    <p className="text-xs text-muted-foreground sm:max-w-[min(100%,280px)] sm:text-right leading-relaxed border border-yellow-500/20 bg-yellow-500/5 rounded-md p-2">
                      {t("depositCheckout.vipExempt")}
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      variant="gold"
                      className="shrink-0 self-start sm:self-center"
                      onClick={() => navigate(`/deposit-payment/checkout?bookingId=${encodeURIComponent(b.id)}`)}
                    >
                      {t("customer.payAmount", { amount: 50 })}
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("customer.appThemeTitle")}</CardTitle>
            <CardDescription>{t("customer.appThemeDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              type="button"
              variant={theme === "dark" ? "default" : "outline"}
              className="gap-2"
              onClick={() => void setTheme("dark")}
            >
              <Moon className="h-4 w-4" />
              {t("common.dark")}
            </Button>
            <Button
              type="button"
              variant={theme === "light" ? "default" : "outline"}
              className="gap-2"
              onClick={() => void setTheme("light")}
            >
              <Sun className="h-4 w-4" />
              {t("common.light")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{t("customer.invoicesTitle")}</CardTitle>
            </div>
            <CardDescription>{t("customer.invoicesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {shopInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">{t("customer.noInvoicesYet")}</p>
            ) : (
              shopInvoices.slice(0, 8).map((inv) => (
                <div key={inv.id} className="rounded-lg border border-border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      £{Number(inv.total || 0).toFixed(2)} · {inv.due_date ? t("customer.dueDate", { date: format(parseISO(inv.due_date), "d MMM yyyy") }) : t("customer.noDueDate")}
                    </p>
                  </div>
                  {inv.status === "paid" ? (
                    <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 w-fit">{t("customer.paid")}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="gold"
                      disabled={payingInvoiceId === inv.id}
                      onClick={async () => {
                        setPayingInvoiceId(inv.id);
                        const { data, error } = await invokeEdgeFunctionJson("create-stripe-checkout", {
                          type: "invoice",
                          invoiceId: inv.id,
                        });
                        if (error || !(data as any)?.checkoutUrl) {
                          setPayingInvoiceId(null);
                          toast.error((data as any)?.error || error?.message || t("subscribe.checkoutFailed"));
                          return;
                        }
                        window.location.href = (data as any).checkoutUrl as string;
                      }}
                    >
                      {payingInvoiceId === inv.id ? t("customer.redirecting") : t("customer.payNow")}
                    </Button>
                  )}
                </div>
              ))
            )}
            {unpaidInvoices.length === 0 && shopInvoices.length > 0 ? (
              <p className="text-xs text-muted-foreground">{t("customer.allInvoicesPaid")}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("customer.attendanceScoreTitle")}</CardTitle>
            <CardDescription>{t("customer.attendanceScoreDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="rounded-md border border-border p-3 space-y-1 text-sm">
              <p>{t("customer.noShows")}: <span className="font-medium">{Number(conduct?.no_shows_count || 0)}/{CLIENT_CONDUCT_THRESHOLDS.noShows}</span></p>
              <p>{t("customer.lateCancellations")}: <span className="font-medium">{Number(conduct?.late_cancellations_count || 0)}/{CLIENT_CONDUCT_THRESHOLDS.lateCancellations}</span></p>
              <p>{t("customer.reschedules")}: <span className="font-medium">{Number(conduct?.reschedules_count || 0)}/{CLIENT_CONDUCT_THRESHOLDS.reschedules}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={
                  conduct?.is_banned
                    ? "bg-destructive/15 text-destructive border-destructive/30"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                }
              >
                {conduct?.is_banned ? t("customer.banned") : t("customer.active")}
              </Badge>
              {conduct?.ban_reason ? (
                <p className="text-xs text-muted-foreground">{t("customer.reason")}: {conduct.ban_reason}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <User className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{t("customer.profileTitle")}</CardTitle>
              {isVipClient ? (
                <Badge variant="outline" className="gap-1 border-yellow-500/40 text-yellow-200 text-xs">
                  <Star className="h-3 w-3" />
                  {t("customer.vipClient")}
                </Badge>
              ) : null}
            </div>
            <CardDescription>
              {t("customer.profileDesc")}
              {isVipClient ? ` · ${t("customer.profileVipNote")}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">{t("common.email")}</Label>
              <Input type="email" value={email} disabled className="mt-1/50" required />
              <p className="text-[11px] text-muted-foreground mt-1">{t("customer.emailLocked")}</p>
            </div>
            <div>
              <Label htmlFor="dn">{t("customer.fullName")}</Label>
              <Input id="dn" value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" required />
            </div>
            <div>
              <Label htmlFor="ph">{t("schedule.phone")}</Label>
              <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" required />
            </div>
            <Button size="sm" onClick={saveProfile} disabled={saving}>
              {saving ? t("settings.saving") : t("customer.saveProfile")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-teal-500" />
              <CardTitle className="text-base">{t("customer.upcomingTitle")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("customer.noUpcoming")}</p>
            ) : (
              upcoming.map((b) => (
                <div key={b.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{format(parseISO(b.starts_at), "EEE d MMM yyyy, h:mm a")}</p>
                    {b.vip_client ? (
                      <Badge className="text-[10px] bg-yellow-500/15 text-yellow-200 border-yellow-500/30">VIP</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {b.booking_type} · {(b.service_category || "tattoo").replace(/^./, (c) => c.toUpperCase())} · {b.status}
                  </p>
                  {b.tattoo_style && <p className="text-xs text-muted-foreground">{t("clients.stylePrefix", { style: b.tattoo_style })}</p>}
                  {hasPermission("customer_consent") && bookingEligibleForConsent(b) ? (
                    <Button asChild variant="gold-outline" size="sm" className="w-full sm:w-auto mt-1">
                      <Link to={`/consent?bookingId=${encodeURIComponent(b.id)}`}>{t("customer.fillConsentForm")}</Link>
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("customer.pastVisitsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {past.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("customer.noPastVisits")}</p>
            ) : (
              past.slice(0, 20).map((b) => (
                <div key={b.id} className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{format(parseISO(b.starts_at), "d MMM yyyy")}</p>
                    {b.vip_client ? (
                      <Badge className="text-[10px] bg-yellow-500/15 text-yellow-200 border-yellow-500/30">VIP</Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {b.booking_type} · {(b.service_category || "tattoo").replace(/^./, (c) => c.toUpperCase())} · {b.status}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
};

export default CustomerAccountPage;

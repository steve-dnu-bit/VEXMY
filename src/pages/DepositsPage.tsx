import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, isAfter, parseISO, startOfDay, subDays } from "date-fns";
import { Send, CheckCircle, Clock, Star, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maxDepositAmountForCurrency } from "@/lib/depositLimits";
import {
  loadShopDefaultDepositAmount,
  parseDepositInput,
  saveShopDefaultDepositAmount,
} from "@/lib/shopDepositSettings";
import { bookingRequiresDeposit } from "@/lib/serviceDeposit";
import { toast } from "sonner";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import SubscriptionGate from "@/components/subscription/SubscriptionGate";
import StripeConnectCard from "@/components/subscription/StripeConnectCard";
import { useTranslation } from "react-i18next";
import { loadShopSettings } from "@/lib/shopSettings";
import { currencyForShopCountry, formatShopMoney } from "@/lib/shopCurrency";

interface BookingWithDeposit {
  id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  starts_at: string;
  deposit_amount: number | null;
  deposit_paid: boolean | null;
  deposit_link_sent: boolean | null;
  deposit_payment_id: string | null;
  vip_client: boolean | null;
  booking_type: string;
  status: string;
}

type TimeFilter = "all" | "upcoming" | "past";

const DepositsPage = () => {
  const { t } = useTranslation();
  const [bookings, setBookings] = useState<BookingWithDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
  /**
   * Only load bookings from this many days ago onward (plus all future).
   * Querying the whole table hits the ~1000 row cap and returns the *oldest* rows first — wrong for deposits.
   */
  const [daysBack, setDaysBack] = useState<14 | 90>(14);
  const [shopCurrency, setShopCurrency] = useState("gbp");
  const [defaultDeposit, setDefaultDeposit] = useState(50);
  const [defaultDepositInput, setDefaultDepositInput] = useState("50");
  const [savingDefaultDeposit, setSavingDefaultDeposit] = useState(false);

  useEffect(() => {
    void Promise.all([loadShopSettings(), loadShopDefaultDepositAmount()]).then(([shop, amount]) => {
      setShopCurrency(currencyForShopCountry(shop?.country));
      setDefaultDeposit(amount);
      setDefaultDepositInput(String(amount));
    });
  }, []);

  const syncPendingDeposits = useCallback(async (pending: BookingWithDeposit[]) => {
    const toSync = pending.filter((b) => b.deposit_link_sent && !b.deposit_paid && b.deposit_payment_id);
    if (!toSync.length) return false;
    let anyConfirmed = false;
    await Promise.all(
      toSync.map(async (booking) => {
        const { data, error } = await invokeEdgeFunctionJson("create-stripe-checkout", {
          type: "deposit",
          action: "sync",
          bookingId: booking.id,
        });
        if (!error && (data as { confirmed?: boolean })?.confirmed) {
          anyConfirmed = true;
        }
      }),
    );
    return anyConfirmed;
  }, []);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    const from = startOfDay(subDays(new Date(), daysBack));
    const { data, error } = await supabase
      .from("bookings")
      .select("id, client_name, client_email, client_phone, starts_at, deposit_amount, deposit_paid, deposit_link_sent, deposit_payment_id, vip_client, booking_type, status")
      .gte("starts_at", from.toISOString())
      .order("starts_at", { ascending: true });
    if (error) {
      toast.error(error.message || t("deposits.loadFailed"));
      setBookings([]);
      setLoading(false);
      return;
    }
    const rows = (data as BookingWithDeposit[]) || [];
    setBookings(rows);
    setLoading(false);
    const pending = rows.filter((b) => b.deposit_link_sent && !b.deposit_paid && b.deposit_payment_id);
    if (pending.length) {
      const confirmed = await syncPendingDeposits(pending);
      if (confirmed) {
        const { data: refreshed } = await supabase
          .from("bookings")
          .select("id, client_name, client_email, client_phone, starts_at, deposit_amount, deposit_paid, deposit_link_sent, deposit_payment_id, vip_client, booking_type, status")
          .gte("starts_at", from.toISOString())
          .order("starts_at", { ascending: true });
        if (refreshed) setBookings((refreshed as BookingWithDeposit[]) || []);
      }
    }
  }, [daysBack, syncPendingDeposits, t]);

  useEffect(() => {
    void fetchBookings();
  }, [fetchBookings]);

  const formatAmount = (amount: number | null | undefined) =>
    formatShopMoney(amount ?? defaultDeposit, shopCurrency);

  const maxDeposit = maxDepositAmountForCurrency(shopCurrency);

  const saveDefaultDeposit = async () => {
    const parsed = parseDepositInput(defaultDepositInput, shopCurrency);
    if (parsed == null) {
      toast.error(t("deposits.defaultDepositInvalid", { max: formatShopMoney(maxDeposit, shopCurrency) }));
      return;
    }
    setSavingDefaultDeposit(true);
    const { error } = await saveShopDefaultDepositAmount(parsed);
    setSavingDefaultDeposit(false);
    if (error) {
      toast.error(error);
      return;
    }
    setDefaultDeposit(parsed);
    setDefaultDepositInput(String(parsed));
    toast.success(t("deposits.defaultDepositSaved"));
  };

  useEffect(() => {
    const channel = supabase
      .channel("deposits-bookings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        void fetchBookings();
      })
      .subscribe();
    const poll = window.setInterval(() => {
      void fetchBookings();
    }, 60_000);
    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [fetchBookings]);

  const handleSendDepositLink = async (booking: BookingWithDeposit) => {
    if (!booking.client_email && !booking.client_phone) {
      toast.error(t("deposits.noContactInfo"));
      return;
    }
    if (!booking.client_email) {
      toast.error(t("deposits.noEmailForBooking"));
      return;
    }
    const { data, error } = await invokeEdgeFunctionJson("create-stripe-checkout", {
      type: "deposit",
      bookingId: booking.id,
      sendEmail: true,
    });
    if (error || !(data as any)?.checkoutUrl) {
      const code = (data as any)?.code as string | undefined;
      toast.error(
        code === "connect_required"
          ? t("deposits.connectRequired")
          : (data as any)?.error || error?.message || t("deposits.failedGenerateLink"),
      );
      return;
    }
    const checkoutUrl = (data as any).checkoutUrl as string;
    const emailAttempted = !!(data as any)?.emailAttempted;
    const emailSent = !!(data as any)?.emailSent;
    const emailError = ((data as any)?.emailError as string | null | undefined) ?? null;
    const emailFailureMessage =
      emailError || "Unknown email delivery error. Please check SMTP credentials/provider logs.";
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      if (emailSent) {
        toast.success("Deposit reminder email sent and checkout link copied");
        toast.success(t("deposits.sentAndCopied"));
      } else {
        toast.error(
          emailAttempted
            ? t("deposits.copiedButEmailFailed", { reason: emailFailureMessage })
            : t("deposits.copiedEmailNotAttempted"),
        );
      }
    } catch {
      if (emailSent) {
        toast.success(t("deposits.sentEmailOnly"));
      } else {
        toast.error(
          emailAttempted
            ? t("deposits.createdButEmailFailed", { reason: emailFailureMessage })
            : t("deposits.createdEmailNotAttempted"),
        );
      }
      toast.message(checkoutUrl);
    }
    fetchBookings();
  };

  const handleMarkPaid = async (bookingId: string) => {
    const stripeReference = `manual_paid_${Date.now()}`;
    await supabase
      .from("bookings")
      .update({ deposit_paid: true, deposit_payment_id: stripeReference } as any)
      .eq("id", bookingId);
    toast.success(t("deposits.markedPaid"));
    fetchBookings();
  };

  const handleMarkUnpaid = async (bookingId: string) => {
    await supabase
      .from("bookings")
      .update({ deposit_paid: false } as any)
      .eq("id", bookingId);
    toast.success(t("deposits.markedUnpaid"));
    fetchBookings();
  };

  const handleToggleVip = async (booking: BookingWithDeposit) => {
    const nextVip = !booking.vip_client;
    const { error } = await supabase.from("bookings").update({ vip_client: nextVip } as any).eq("id", booking.id);
    if (error) {
      toast.error(error.message || t("deposits.failedVipUpdate"));
      return;
    }
    toast.success(nextVip ? t("deposits.markedVip") : t("deposits.vipRemoved"));
    fetchBookings();
  };

  const isUpcomingBooking = useCallback((startsAt: string) => isAfter(parseISO(startsAt), new Date()), []);

  const depositBookings = useMemo(
    () => bookings.filter((b) => !b.vip_client && (b.deposit_amount ?? defaultDeposit) > 0),
    [bookings, defaultDeposit],
  );

  /** Filter + sort: upcoming = soonest first; past = most recent past first; all = closest to “now” in time. */
  const filteredBookings = useMemo(() => {
    const now = new Date().getTime();
    const upcoming = depositBookings.filter((b) => isUpcomingBooking(b.starts_at));
    const past = depositBookings.filter((b) => !isUpcomingBooking(b.starts_at));

    let list: BookingWithDeposit[];
    if (timeFilter === "upcoming") {
      list = upcoming;
      list = [...list].sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime());
    } else if (timeFilter === "past") {
      list = past;
      list = [...list].sort((a, b) => parseISO(b.starts_at).getTime() - parseISO(a.starts_at).getTime());
    } else {
      list = [...depositBookings].sort((a, b) => {
        const da = Math.abs(parseISO(a.starts_at).getTime() - now);
        const db = Math.abs(parseISO(b.starts_at).getTime() - now);
        if (da !== db) return da - db;
        return parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime();
      });
    }
    return list;
  }, [depositBookings, timeFilter, isUpcomingBooking]);

  const unpaidCount = depositBookings.filter((b) => bookingRequiresDeposit(b, defaultDeposit)).length;
  const paidCount = depositBookings.filter((b) => !!b.deposit_paid && (b.deposit_amount ?? defaultDeposit) > 0).length;
  const upcomingCount = depositBookings.filter((b) => isUpcomingBooking(b.starts_at)).length;
  const totalCollected = depositBookings
    .filter((b) => !!b.deposit_paid)
    .reduce((sum, b) => sum + (b.deposit_amount || defaultDeposit), 0);

  return (
    <AppLayout>
      <SubscriptionGate>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">{t("deposits.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("deposits.subtitle")}</p>
            {!loading && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("deposits.windowInfo", { days: daysBack })}
              </p>
            )}
          </div>
          <Button
            variant={daysBack === 90 ? "secondary" : "outline"}
            size="sm"
            className="shrink-0"
            onClick={() => setDaysBack((d) => (d === 14 ? 90 : 14))}
          >
            {daysBack === 14 ? t("deposits.widerWindow") : t("deposits.defaultWindow")}
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              {t("deposits.defaultDepositTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4 max-w-md">
            <div className="flex-1">
              <Label htmlFor="default-deposit">{t("deposits.defaultDepositLabel")}</Label>
              <Input
                id="default-deposit"
                type="number"
                min={0.3}
                max={maxDeposit}
                step={0.01}
                value={defaultDepositInput}
                onChange={(e) => setDefaultDepositInput(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("deposits.defaultDepositHint", {
                  max: formatShopMoney(maxDeposit, shopCurrency),
                })}
              </p>
            </div>
            <Button onClick={saveDefaultDeposit} disabled={savingDefaultDeposit} className="shrink-0">
              {savingDefaultDeposit ? t("settings.saving") : t("common.save")}
            </Button>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("deposits.inWindow")}</p>
              <p className="text-2xl font-display font-bold mt-1">{bookings.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("deposits.depositsPaid")}</p>
              <p className="text-2xl font-display font-bold text-emerald-400 mt-1">{paidCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("deposits.pending")}</p>
              <p className="text-2xl font-display font-bold text-amber-400 mt-1">{unpaidCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("deposits.upcoming")}</p>
              <p className="text-2xl font-display font-bold mt-1">{upcomingCount}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" /> {t("deposits.listTitle")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("deposits.listDesc")}
            </p>
            <Tabs value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)} className="mt-3 w-full max-w-md">
              <TabsList className="grid w-full grid-cols-3 h-9">
                <TabsTrigger value="upcoming" className="text-xs sm:text-sm">
                  {t("deposits.tabUpcoming")}
                </TabsTrigger>
                <TabsTrigger value="past" className="text-xs sm:text-sm">
                  {t("deposits.tabPast")}
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs sm:text-sm">
                  {t("deposits.tabAll")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-[11px] text-muted-foreground mt-2">
              {t("deposits.showingCount", { filtered: filteredBookings.length, total: bookings.length })}
              {" · "}
              {timeFilter === "upcoming" ? t("deposits.sortUpcoming") : timeFilter === "past" ? t("deposits.sortPast") : t("deposits.sortAll")}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="text-sm text-muted-foreground p-4">{t("deposits.loadingBookings")}</p>
            ) : bookings.length === 0 ? (
              <div className="p-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("deposits.noInWindow")}
                </p>
                {daysBack === 14 ? (
                  <Button size="sm" variant="secondary" onClick={() => setDaysBack(90)}>
                    {t("deposits.load90Days")}
                  </Button>
                ) : null}
              </div>
            ) : filteredBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">
                {timeFilter === "upcoming"
                  ? t("deposits.noUpcomingInWindow")
                  : timeFilter === "past"
                    ? t("deposits.noPastInWindow")
                    : t("deposits.noAppointments")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("deposits.when")}</TableHead>
                    <TableHead>{t("deposits.client")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("deposits.type")}</TableHead>
                    <TableHead>{t("deposits.deposit")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("deposits.contact")}</TableHead>
                    <TableHead>{t("deposits.paidQuestion")}</TableHead>
                    <TableHead className="text-right">{t("deposits.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((b) => {
                    const start = parseISO(b.starts_at);
                    const isFuture = isUpcomingBooking(b.starts_at);
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          <div>{format(start, "d MMM yyyy")}</div>
                          <div className="text-[10px]">{format(start, "HH:mm")}</div>
                          {isFuture ? (
                            <Badge variant="outline" className="text-[9px] mt-1 border-teal-500/30 text-teal-300">
                              {t("deposits.badgeUpcoming")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] mt-1">
                              {t("deposits.badgePast")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{b.client_name}</span>
                            {b.vip_client ? (
                              <Badge className="text-[10px] bg-yellow-500/15 text-yellow-300 border-yellow-500/30">{t("deposits.badgeVip")}</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{b.booking_type}</TableCell>
                        <TableCell>{formatAmount(b.deposit_amount)}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex gap-1 flex-wrap">
                            {b.client_email && <Badge variant="outline" className="text-[10px]">{t("deposits.badgeEmail")}</Badge>}
                            {b.client_phone && <Badge variant="outline" className="text-[10px]">{t("deposits.badgeSms")}</Badge>}
                            {!b.client_email && !b.client_phone && (
                              <span className="text-[10px] text-destructive">{t("deposits.noContact")}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {b.deposit_paid ? (
                            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25 text-[10px]">{t("deposits.badgePaid")}</Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-200 border-amber-500/25 text-[10px]">{t("deposits.badgePending")}</Badge>
                          )}
                          {b.deposit_link_sent && !b.deposit_paid ? (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{t("deposits.linkSent")}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end flex-col sm:flex-row">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleSendDepositLink(b)}>
                              <Send className="h-3 w-3" /> {t("deposits.reminder")}
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleMarkPaid(b.id)} disabled={!!b.deposit_paid}>
                              <CheckCircle className="h-3 w-3" /> {t("deposits.paid")}
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleMarkUnpaid(b.id)} disabled={!b.deposit_paid}>
                              {t("deposits.unpaid")}
                            </Button>
                            <Button
                              size="sm"
                              variant={b.vip_client ? "secondary" : "outline"}
                              className="h-7 text-xs gap-1"
                              onClick={() => handleToggleVip(b)}
                            >
                              <Star className="h-3 w-3" /> {t("deposits.badgeVip")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <StripeConnectCard compact returnPath="/deposits" refreshPath="/deposits" />
      </div>
      </SubscriptionGate>
    </AppLayout>
  );
};

export default DepositsPage;

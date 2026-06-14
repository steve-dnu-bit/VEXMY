import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, CreditCard, Loader2, User, Wifi, WifiOff, CheckCircle2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import SubscriptionGate from "@/components/subscription/SubscriptionGate";
import OrgPosSetupChecklist from "@/components/pos/OrgPosSetupChecklist";
import StripeConnectCard from "@/components/subscription/StripeConnectCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatShopMoney } from "@/lib/shopCurrency";
import { loadOrgBillingContext } from "@/lib/orgBilling";
import { format, parseISO } from "date-fns";
import {
  computeAmountDue,
  computeDepositCredit,
  computePosTotals,
  loadArtistPosSplits,
  loadBookingForPosPrefill,
  loadRecentPosSales,
  loadShopPosSettings,
  pickServiceForBooking,
  resolveSplitPercents,
  splitPosAmount,
  type PosBookingPrefill,
  type PosLineItem,
  type PosSaleRow,
} from "@/lib/posCheckout";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { useStripeTerminal } from "@/hooks/useStripeTerminal";
import { useSearchParams } from "react-router-dom";

interface ServiceRow {
  id: string;
  name: string;
  price: number | null;
  service_category: string;
  booking_type: string;
  duration: number;
  color: string;
}

interface ArtistOption {
  user_id: string;
  display_name: string;
}

interface CartEntry {
  key: string;
  serviceId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
}

const PosCheckoutPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const prefilledArtistId = searchParams.get("artistId");
  const prefilledClientName = searchParams.get("clientName");
  const prefilledBookingId = searchParams.get("bookingId");
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [artistId, setArtistId] = useState("");
  const [clientName, setClientName] = useState("");
  const [gratuityPercent, setGratuityPercent] = useState(0);
  const [gratuityEnabled, setGratuityEnabled] = useState(false);
  const [currency, setCurrency] = useState("gbp");
  const [taxRate, setTaxRate] = useState(0);
  const [taxLabel, setTaxLabel] = useState("VAT");
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [taxExempt, setTaxExempt] = useState(false);
  const [posEnabled, setPosEnabled] = useState(false);
  const [shopSplit, setShopSplit] = useState({ shopPercent: 30, artistPercent: 70 });
  const [artistSplits, setArtistSplits] = useState<Awaited<ReturnType<typeof loadArtistPosSplits>>>([]);
  const [simulatedReader, setSimulatedReader] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [connectReady, setConnectReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [recentSales, setRecentSales] = useState<PosSaleRow[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ name: "", price: "", quantity: "1" });
  const [linkedBooking, setLinkedBooking] = useState<PosBookingPrefill | null>(null);
  const bookingPrefillDone = useRef(false);

  const terminal = useStripeTerminal({ simulated: simulatedReader, locationId });

  const refreshRecentSales = async () => {
    const rows = await loadRecentPosSales();
    setRecentSales(rows);
  };

  useEffect(() => {
    if (!user) return;
    void (async () => {
      setLoading(true);
      const [servicesRes, profilesRes, rolesRes, billingCtx, posSettings, splits, connectRes, recentSalesRes] = await Promise.all([
        supabase.from("services").select("id, name, price, service_category, booking_type, duration, color").eq("is_active", true).order("sort_order"),
        supabase.from("profiles").select("user_id, display_name"),
        supabase.from("user_roles").select("user_id, role").eq("role", "artist"),
        loadOrgBillingContext(),
        loadShopPosSettings(),
        loadArtistPosSplits(),
        invokeEdgeFunctionJson<{ connect?: { ready?: boolean } }>("stripe-terminal-pos", { action: "connect_status" }),
        loadRecentPosSales(),
      ]);

      const artistIds = new Set((rolesRes.data || []).map((r) => r.user_id));
      const artistList = (profilesRes.data || []).filter((p) => artistIds.has(p.user_id)) as ArtistOption[];

      setArtists(artistList);
      setServices((servicesRes.data || []) as ServiceRow[]);
      setCurrency(billingCtx.currency);
      setTaxRate(billingCtx.defaultTaxRate);
      setTaxLabel(billingCtx.taxLabel);
      setPricesIncludeTax(billingCtx.pricesIncludeTax);
      setTaxExempt(billingCtx.taxExempt);
      setArtistSplits(splits);
      setConnectReady(!!connectRes.data?.connect?.ready);

      setArtistId((current) => {
        if (prefilledArtistId) return prefilledArtistId;
        if (current) return current;
        if (user.id && artistIds.has(user.id)) return user.id;
        if (artistList.length > 0) return artistList[0].user_id;
        return current;
      });
      if (prefilledClientName) setClientName(prefilledClientName);

      if (posSettings) {
        setPosEnabled(posSettings.enabled);
        setSimulatedReader(posSettings.simulated_reader);
        setLocationId(posSettings.stripe_terminal_location_id);
        setGratuityEnabled(posSettings.gratuity_enabled);
        setGratuityPercent(posSettings.gratuity_enabled ? posSettings.default_gratuity_percent : 0);
        setShopSplit({
          shopPercent: posSettings.shop_split_percent,
          artistPercent: posSettings.artist_split_percent,
        });
      }
      setRecentSales(recentSalesRes);
      setLoading(false);
    })();
  }, [user, prefilledArtistId, prefilledClientName]);

  useEffect(() => {
    if (!prefilledBookingId || loading) return;
    void loadBookingForPosPrefill(prefilledBookingId).then((booking) => {
      if (booking) setLinkedBooking(booking);
    });
  }, [prefilledBookingId, loading]);

  useEffect(() => {
    if (!prefilledBookingId || loading || bookingPrefillDone.current) return;
    bookingPrefillDone.current = true;
    void (async () => {
      const booking = await loadBookingForPosPrefill(prefilledBookingId);
      if (!booking) return;
      const service = pickServiceForBooking(services, booking);
      if (!service) return;
      setCart([
        {
          key: service.id,
          serviceId: service.id,
          name: service.name,
          unitPrice: service.price ?? 0,
          quantity: 1,
        },
      ]);
    })();
  }, [prefilledBookingId, loading, services]);

  const lineItems: PosLineItem[] = useMemo(
    () =>
      cart.map((entry) => ({
        serviceId: entry.serviceId,
        name: entry.name,
        quantity: entry.quantity,
        unitPrice: entry.unitPrice,
        lineTotal: Math.round(entry.unitPrice * entry.quantity * 100) / 100,
      })),
    [cart],
  );

  const activeSplit = useMemo(() => {
    const override = artistSplits.find((s) => s.artist_id === artistId);
    return resolveSplitPercents(
      { shop_split_percent: shopSplit.shopPercent, artist_split_percent: shopSplit.artistPercent },
      override,
    );
  }, [artistId, artistSplits, shopSplit]);

  const totals = useMemo(
    () =>
      computePosTotals({
        lineItems,
        taxRate,
        pricesIncludeTax,
        taxExempt,
        gratuityPercent: gratuityEnabled ? gratuityPercent : 0,
        shopPercent: activeSplit.shopPercent,
        artistPercent: activeSplit.artistPercent,
      }),
    [lineItems, taxRate, pricesIncludeTax, taxExempt, gratuityPercent, gratuityEnabled, activeSplit],
  );

  const depositCredit = useMemo(
    () => computeDepositCredit(totals.total, linkedBooking, prefilledBookingId),
    [totals.total, linkedBooking, prefilledBookingId],
  );

  const amountDue = useMemo(
    () => computeAmountDue(totals.total, depositCredit),
    [totals.total, depositCredit],
  );

  const dueSplit = useMemo(
    () => splitPosAmount(amountDue, activeSplit.shopPercent, activeSplit.artistPercent),
    [amountDue, activeSplit],
  );

  const selectedArtist = artists.find((a) => a.user_id === artistId);

  const addService = (service: ServiceRow) => {
    const price = service.price ?? 0;
    setCart((prev) => {
      const existing = prev.find((c) => c.serviceId === service.id);
      if (existing) {
        return prev.map((c) => (c.serviceId === service.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [
        ...prev,
        {
          key: service.id,
          serviceId: service.id,
          name: service.name,
          unitPrice: price,
          quantity: 1,
        },
      ];
    });
  };

  const updateQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.key === key ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c))
        .filter((c) => c.quantity > 0),
    );
  };

  const addCustomItem = () => {
    const name = customForm.name.trim();
    const unitPrice = Number(customForm.price);
    const quantity = Math.max(1, parseInt(customForm.quantity, 10) || 1);
    if (!name || Number.isNaN(unitPrice) || unitPrice < 0) {
      toast.error(t("pos.customItemInvalid"));
      return;
    }
    const key = `custom-${Date.now()}`;
    setCart((prev) => [...prev, { key, serviceId: null, name, unitPrice, quantity }]);
    setCustomForm({ name: "", price: "", quantity: "1" });
    setCustomOpen(false);
  };

  const clearCart = () => {
    setCart([]);
    setClientName("");
    setLastSaleId(null);
  };

  const handlePay = async () => {
    if (!artistId || cart.length === 0) {
      toast.error(t("pos.addItemsFirst"));
      return;
    }
    if (!connectReady && amountDue > 0) {
      toast.error(t("pos.connectRequired"));
      return;
    }
    if (!simulatedReader && !locationId && amountDue > 0) {
      toast.error(t("pos.locationRequired"));
      return;
    }

    setPaying(true);
    let saleId: string | null = null;
    try {
      const { data: piData, error: piErr } = await invokeEdgeFunctionJson<{
        clientSecret?: string;
        saleId?: string;
        paymentIntentId?: string;
        zeroBalance?: boolean;
      }>("stripe-terminal-pos", {
        action: "create_payment_intent",
        artistId,
        clientName,
        currency,
        items: lineItems,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        gratuityAmount: totals.gratuityAmount,
        sessionTotal: totals.total,
        depositCreditAmount: depositCredit,
        total: amountDue,
        shopAmount: dueSplit.shopAmount,
        artistAmount: dueSplit.artistAmount,
        shopSplitPercent: activeSplit.shopPercent,
        artistSplitPercent: activeSplit.artistPercent,
        bookingId: prefilledBookingId || undefined,
      });

      if (piErr || !piData.saleId) {
        throw new Error(piErr?.message || t("pos.paymentFailed"));
      }

      saleId = piData.saleId;

      if (piData.zeroBalance) {
        setLastSaleId(piData.saleId);
        toast.success(t("pos.depositCoversBalance"));
        setCart([]);
        setClientName("");
        setLinkedBooking(null);
        await refreshRecentSales();
        return;
      }

      if (!piData.clientSecret) {
        throw new Error(t("pos.paymentFailed"));
      }

      const result = await terminal.collectAndProcess(piData.clientSecret);

      await invokeEdgeFunctionJson("stripe-terminal-pos", {
        action: "complete_sale",
        saleId: piData.saleId,
        paymentIntentId: result.paymentIntentId,
        readerId: result.readerId,
        status: "succeeded",
      });

      setLastSaleId(piData.saleId);
      toast.success(t("pos.paymentSuccess"));
      setCart([]);
      setClientName("");
      setLinkedBooking(null);
      await refreshRecentSales();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("pos.paymentFailed");
      toast.error(msg);
      if (saleId) {
        await invokeEdgeFunctionJson("stripe-terminal-pos", {
          action: "complete_sale",
          saleId,
          status: "failed",
        });
      }
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!posEnabled) {
    return (
      <AppLayout>
        <SubscriptionGate>
          <div className="mx-auto max-w-lg py-12 px-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("pos.checkoutTitle")}</CardTitle>
                <CardDescription>{t("pos.notEnabledDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <OrgPosSetupChecklist />
              </CardContent>
            </Card>
          </div>
        </SubscriptionGate>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <SubscriptionGate>
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-semibold tracking-tight">{t("pos.checkoutTitle")}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t("pos.checkoutSubtitle")}</p>
              {prefilledBookingId ? (
                <Badge variant="outline" className="mt-2 text-xs">
                  {t("pos.linkedBooking")}
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {terminal.status === "connected" ? (
                <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600">
                  <Wifi className="h-3 w-3" />
                  {settingsReaderLabel(simulatedReader, terminal.reader?.label)}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <WifiOff className="h-3 w-3" />
                  {t("pos.readerDisconnected")}
                </Badge>
              )}
            </div>
          </div>

          {!connectReady || !locationId ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("pos.setupChecklist.finishSetupTitle")}</CardTitle>
                <CardDescription>{t("pos.setupChecklist.finishSetupDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!connectReady ? (
                  <StripeConnectCard compact returnPath="/checkout" refreshPath="/checkout" />
                ) : null}
                <OrgPosSetupChecklist hideAdminLink />
              </CardContent>
            </Card>
          ) : null}

          <div className="grid lg:grid-cols-5 gap-6">
            {/* Services */}
            <div className="lg:col-span-3 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{t("pos.services")}</CardTitle>
                      <CardDescription>{t("pos.servicesHint")}</CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setCustomOpen(true)}>
                      {t("pos.addCustomItem")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {services.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => addService(service)}
                        className="text-left rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors p-4 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium leading-snug">{service.name}</span>
                          <span className="text-sm font-semibold tabular-nums shrink-0">
                            {formatShopMoney(service.price ?? 0, currency)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">
                          {service.service_category} · {service.duration} min
                        </p>
                      </button>
                    ))}
                    {services.length === 0 && (
                      <p className="text-sm text-muted-foreground col-span-2 py-6 text-center">{t("pos.noServices")}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {t("pos.sessionDetails")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>{t("pos.artist")}</Label>
                    <Select value={artistId} onValueChange={setArtistId}>
                      <SelectTrigger className="mt-1 bg-secondary">
                        <SelectValue placeholder={t("pos.selectArtist")} />
                      </SelectTrigger>
                      <SelectContent>
                        {artists.map((a) => (
                          <SelectItem key={a.user_id} value={a.user_id}>
                            {a.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="pos-client">{t("pos.clientName")}</Label>
                    <Input
                      id="pos-client"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder={t("pos.clientNamePlaceholder")}
                      className="mt-1 bg-secondary"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Order summary */}
            <div className="lg:col-span-2">
              <Card className="sticky top-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{t("pos.orderSummary")}</CardTitle>
                  {selectedArtist && (
                    <CardDescription>
                      {t("pos.withArtist", { name: selectedArtist.display_name })}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {cart.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">{t("pos.emptyCart")}</p>
                  ) : (
                    <div className="space-y-3">
                      {cart.map((item) => (
                        <div key={item.key} className="flex items-start gap-3 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{item.name}</p>
                            <p className="text-muted-foreground text-xs tabular-nums">
                              {formatShopMoney(item.unitPrice, currency)} × {item.quantity}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.key, -1)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center tabular-nums">{item.quantity}</span>
                            <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.key, 1)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="font-medium tabular-nums w-20 text-right">
                            {formatShopMoney(item.unitPrice * item.quantity, currency)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <Separator />

                  {gratuityEnabled && cart.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">{t("pos.gratuityAdjust")}</Label>
                      <div className="flex flex-wrap gap-2">
                        {[0, 10, 15, 20].map((pct) => (
                          <Button
                            key={pct}
                            type="button"
                            size="sm"
                            variant={gratuityPercent === pct ? "default" : "outline"}
                            className="h-8 px-3"
                            onClick={() => setGratuityPercent(pct)}
                          >
                            {pct === 0 ? t("pos.gratuityNone") : `${pct}%`}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t("pos.subtotal")}</dt>
                      <dd className="tabular-nums font-medium">{formatShopMoney(totals.subtotal, currency)}</dd>
                    </div>
                    {!taxExempt && taxRate > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">{taxLabel} ({taxRate}%)</dt>
                        <dd className="tabular-nums">{formatShopMoney(totals.taxAmount, currency)}</dd>
                      </div>
                    )}
                    {gratuityEnabled && gratuityPercent > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">{t("pos.gratuity")} ({gratuityPercent}%)</dt>
                        <dd className="tabular-nums">{formatShopMoney(totals.gratuityAmount, currency)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between text-base pt-1">
                      <dt className="font-semibold">{t("pos.total")}</dt>
                      <dd className="font-bold tabular-nums text-lg">{formatShopMoney(totals.total, currency)}</dd>
                    </div>
                    {depositCredit > 0 ? (
                      <>
                        <div className="flex justify-between text-emerald-600">
                          <dt>{t("pos.depositCredit")}</dt>
                          <dd className="tabular-nums font-medium">−{formatShopMoney(depositCredit, currency)}</dd>
                        </div>
                        <div className="flex justify-between text-base border-t border-border pt-2">
                          <dt className="font-semibold">{t("pos.amountDue")}</dt>
                          <dd className="font-bold tabular-nums text-lg">{formatShopMoney(amountDue, currency)}</dd>
                        </div>
                      </>
                    ) : null}
                  </dl>

                  <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                    <p className="font-medium text-sm">{t("pos.paymentSplit")}</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("pos.shopShare", { percent: activeSplit.shopPercent })}</span>
                      <span className="tabular-nums font-medium">{formatShopMoney(dueSplit.shopAmount, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("pos.artistShare", { percent: activeSplit.artistPercent })}</span>
                      <span className="tabular-nums font-medium">{formatShopMoney(dueSplit.artistAmount, currency)}</span>
                    </div>
                    {depositCredit > 0 ? (
                      <p className="text-[11px] text-muted-foreground pt-1">{t("pos.depositSplitHint")}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2 pt-2">
                    {terminal.status !== "connected" ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={terminal.status === "discovering" || terminal.status === "connecting"}
                        onClick={() => void terminal.discoverAndConnect().catch(() => undefined)}
                      >
                        {terminal.status === "discovering" || terminal.status === "connecting" ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Wifi className="h-4 w-4 mr-2" />
                        )}
                        {t("pos.connectReader")}
                      </Button>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => void terminal.disconnect()}>
                        {t("pos.disconnectReader")}
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="gold"
                      className="w-full h-12 text-base"
                      disabled={paying || cart.length === 0 || !artistId || (amountDue > 0 && terminal.status === "processing")}
                      onClick={() => void handlePay()}
                    >
                      {paying || (amountDue > 0 && terminal.status === "processing") ? (
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      ) : (
                        <CreditCard className="h-5 w-5 mr-2" />
                      )}
                      {amountDue <= 0 && depositCredit > 0
                        ? t("pos.completeNoCharge")
                        : t("pos.chargeCard", { amount: formatShopMoney(amountDue, currency) })}
                    </Button>

                    {cart.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" className="w-full" onClick={clearCart}>
                        {t("pos.clearOrder")}
                      </Button>
                    )}
                  </div>

                  {terminal.error && <p className="text-xs text-destructive">{terminal.error}</p>}

                  {lastSaleId && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      {t("pos.lastPaymentRecorded")}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{t("pos.recentSales")}</CardTitle>
              <CardDescription>{t("pos.recentSalesHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              {recentSales.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">{t("pos.noRecentSales")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">{t("common.name")}</th>
                        <th className="pb-2 pr-4 font-medium">{t("pos.artist")}</th>
                        <th className="pb-2 pr-4 font-medium text-right">{t("pos.total")}</th>
                        <th className="pb-2 pr-4 font-medium text-right">{t("pos.paymentSplit")}</th>
                        <th className="pb-2 font-medium">{t("pos.saleTime")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSales.map((sale) => {
                        const artistName = artists.find((a) => a.user_id === sale.artist_id)?.display_name || "—";
                        const itemSummary = Array.isArray(sale.items)
                          ? (sale.items as PosLineItem[]).map((i) => i.name).slice(0, 2).join(", ")
                          : "";
                        const statusLabel =
                          sale.status === "succeeded"
                            ? t("pos.saleStatusSucceeded")
                            : sale.status === "pending"
                              ? t("pos.saleStatusPending")
                              : t("pos.saleStatusFailed");
                        return (
                          <tr key={sale.id} className="border-b border-border/60 last:border-0">
                            <td className="py-3 pr-4">
                              <p className="font-medium">{sale.client_name || "—"}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[180px]">{itemSummary}</p>
                            </td>
                            <td className="py-3 pr-4">{artistName}</td>
                            <td className="py-3 pr-4 text-right tabular-nums font-medium">
                              {formatShopMoney(Number(sale.total), sale.currency)}
                            </td>
                            <td className="py-3 pr-4 text-right text-xs tabular-nums text-muted-foreground">
                              {formatShopMoney(Number(sale.shop_amount), sale.currency)} / {formatShopMoney(Number(sale.artist_amount), sale.currency)}
                            </td>
                            <td className="py-3 text-xs text-muted-foreground whitespace-nowrap">
                              <span className={sale.status === "succeeded" ? "text-emerald-600" : ""}>{statusLabel}</span>
                              {" · "}
                              {format(parseISO(sale.created_at), "d MMM HH:mm")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={customOpen} onOpenChange={setCustomOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("pos.addCustomItem")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label htmlFor="custom-name">{t("pos.customItemName")}</Label>
                <Input
                  id="custom-name"
                  value={customForm.name}
                  onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("pos.customItemNamePlaceholder")}
                  className="mt-1 bg-secondary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="custom-price">{t("pos.customItemPrice")}</Label>
                  <Input
                    id="custom-price"
                    type="number"
                    min={0}
                    step={0.01}
                    value={customForm.price}
                    onChange={(e) => setCustomForm((f) => ({ ...f, price: e.target.value }))}
                    className="mt-1 bg-secondary"
                  />
                </div>
                <div>
                  <Label htmlFor="custom-qty">{t("pos.units")}</Label>
                  <Input
                    id="custom-qty"
                    type="number"
                    min={1}
                    value={customForm.quantity}
                    onChange={(e) => setCustomForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="mt-1 bg-secondary"
                  />
                </div>
              </div>
              <Button type="button" className="w-full" onClick={addCustomItem}>
                {t("pos.addToOrder")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </SubscriptionGate>
    </AppLayout>
  );
};

function settingsReaderLabel(simulated: boolean, label?: string) {
  if (label) return label;
  return simulated ? "Simulated reader" : "WisePad";
}

export default PosCheckoutPage;

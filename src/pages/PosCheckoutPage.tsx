import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, CreditCard, Loader2, User, Wifi, WifiOff, CheckCircle2, Upload, Download, Search, Smartphone } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import SubscriptionGate from "@/components/subscription/SubscriptionGate";
import { WisePadSetupPanels } from "@/components/pos/WisePadSetupPanels";
import { TapToPayReadinessAlert, useTapToPayReady } from "@/components/pos/TapToPayReadinessAlert";
import OrgPosSetupChecklist from "@/components/pos/OrgPosSetupChecklist";
import StripeConnectCard from "@/components/subscription/StripeConnectCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  importPosItemTemplates,
  loadArtistPosSplits,
  loadBookingForPosPrefill,
  loadPosItemTemplates,
  loadRecentPosSales,
  loadShopPosSettings,
  parsePosProductsFromCsv,
  recordPosItemUsage,
  savePosItemTemplate,
  resolveSplitPercents,
  splitPosAmount,
  type PosBookingPrefill,
  type PosItemTemplate,
  type PosLineItem,
  type PosSaleRow,
} from "@/lib/posCheckout";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { useStripeTerminal } from "@/hooks/useStripeTerminal";
import { isNativeApp, nativePlatform } from "@/lib/platform";
import {
  dismissWisePadSetupGuide,
  hasWisePadFirmwareCompleted,
  isWisePadSetupGuideDismissed,
  markWisePadFirmwareCompleted,
} from "@/lib/terminal/wisePadSetupStorage";
import { ensureTerminalLocation } from "@/lib/terminal/ensureTerminalLocation";
import { buildReaderDisplayCart } from "@/lib/terminal/readerDisplay";
import { setCachedTerminalLocationId } from "@/lib/terminal/terminalLocationCache";
import { runStripeTerminalPreflight } from "@/lib/terminal/fetchConnectionToken";
import {
  loadTerminalReaderMode,
  saveTerminalReaderMode,
} from "@/lib/terminal/terminalReaderModeStorage";
import type { TerminalReaderMode } from "@/lib/terminal/types";
import { useSearchParams } from "react-router-dom";

interface ArtistOption {
  user_id: string;
  display_name: string;
}

interface CartEntry {
  key: string;
  templateId: string | null;
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
  const [quickItems, setQuickItems] = useState<PosItemTemplate[]>([]);
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
  const [readerMode, setReaderMode] = useState<TerminalReaderMode>(() => loadTerminalReaderMode());
  const [locationId, setLocationId] = useState<string | null>(null);
  const [connectReady, setConnectReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [recentSales, setRecentSales] = useState<PosSaleRow[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ name: "", price: "", quantity: "1" });
  const [saveForQuickAdd, setSaveForQuickAdd] = useState(true);
  const [linkedBooking, setLinkedBooking] = useState<PosBookingPrefill | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [importingProducts, setImportingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const productsCsvInputRef = useRef<HTMLInputElement>(null);
  const [showWisePadGuide, setShowWisePadGuide] = useState(
    () => isNativeApp() && !isWisePadSetupGuideDismissed() && !hasWisePadFirmwareCompleted(),
  );
  const [testingStripeLink, setTestingStripeLink] = useState(false);

  const canConnectReader = connectReady && !!locationId && (simulatedReader || isNativeApp());
  const connectBlockedReason = !connectReady
    ? t("pos.connectRequired")
    : !locationId
      ? t("pos.locationRequired")
      : null;

  const terminal = useStripeTerminal({
    simulated: simulatedReader,
    readerMode,
    locationId,
    onConnectionTokenError: (message) => toast.error(message),
    onFirmwareUpdateChange: (state) => {
      if (state.completed) {
        markWisePadFirmwareCompleted();
        setShowWisePadGuide(false);
        toast.success(t("pos.wisePadFirmwareComplete"));
      }
    },
  });

  const readerFirmwareUpdating = terminal.firmwareUpdate.active;
  const usingTapToPay = isNativeApp() && !simulatedReader && readerMode === "tap_to_pay";
  const usingWisePad = isNativeApp() && !simulatedReader && readerMode === "bluetooth";
  const tapToPayReady = useTapToPayReady();

  useEffect(() => {
    if (!usingTapToPay) return;
    const refresh = () => tapToPayReady.refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [usingTapToPay, tapToPayReady.refresh]);

  const testStripeServerLink = async () => {
    if (!locationId) {
      toast.error(t("pos.locationRequired"));
      return;
    }
    setTestingStripeLink(true);
    tapToPayReady.refresh();
    const result = await runStripeTerminalPreflight(locationId);
    setTestingStripeLink(false);
    if (result.ok) {
      toast.success(t("pos.tapToPayTestStripeOk"));
    } else {
      toast.error(`${t("pos.tapToPayTestStripeFailed")}: ${result.message}`);
    }
  };

  const readerModeInitializedRef = useRef(false);

  useEffect(() => {
    if (!readerModeInitializedRef.current) {
      readerModeInitializedRef.current = true;
      return;
    }
    if (terminal.status === "connected") {
      void terminal.disconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when the user switches reader type
  }, [readerMode]);

  const handleReaderModeChange = (nextMode: TerminalReaderMode) => {
    setReaderMode(nextMode);
    saveTerminalReaderMode(nextMode);
  };

  const refreshRecentSales = async () => {
    const rows = await loadRecentPosSales();
    setRecentSales(rows);
  };

  const refreshQuickItems = async (orgId?: string | null) => {
    const rows = await loadPosItemTemplates(orgId ?? organizationId);
    setQuickItems(rows);
  };

  useEffect(() => {
    if (!user) return;
    void (async () => {
      setLoading(true);
      try {
        const [profilesRes, rolesRes, billingCtx, posSettings, splits, connectRes, recentSalesRes] = await Promise.all([
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
        const orgId = billingCtx.organizationId ?? null;
        const itemTemplates = await loadPosItemTemplates(orgId);

        setOrganizationId(orgId);
        setArtists(artistList);
        setQuickItems(itemTemplates);
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
          if (posSettings.stripe_terminal_location_id) {
            setLocationId(posSettings.stripe_terminal_location_id);
            setCachedTerminalLocationId(posSettings.stripe_terminal_location_id);
          }
          setGratuityEnabled(posSettings.gratuity_enabled);
          setGratuityPercent(posSettings.gratuity_enabled ? posSettings.default_gratuity_percent : 0);
          setShopSplit({
            shopPercent: posSettings.shop_split_percent,
            artistPercent: posSettings.artist_split_percent,
          });
        }

        setRecentSales(recentSalesRes);

        // Do not block page render on terminal location setup.
        if (connectRes.data?.connect?.ready && posSettings?.enabled && !posSettings.simulated_reader) {
          void ensureTerminalLocation()
            .then((ensuredLocationId) => {
              setLocationId((current) => (current === ensuredLocationId ? current : ensuredLocationId));
            })
            .catch(() => undefined);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user, prefilledArtistId, prefilledClientName]);

  useEffect(() => {
    if (!prefilledBookingId || loading) return;
    void loadBookingForPosPrefill(prefilledBookingId).then((booking) => {
      if (booking) setLinkedBooking(booking);
    });
  }, [prefilledBookingId, loading]);

  const lineItems: PosLineItem[] = useMemo(
    () =>
      cart.map((entry) => ({
        serviceId: entry.templateId,
        name: entry.name,
        quantity: entry.quantity,
        unitPrice: entry.unitPrice,
        lineTotal: Math.round(entry.unitPrice * entry.quantity * 100) / 100,
      })),
    [cart],
  );

  const filteredQuickItems = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return quickItems;
    return quickItems.filter((item) => item.name.toLowerCase().includes(q));
  }, [quickItems, productSearch]);

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

  const pushCartToReader = async () => {
    const cart = buildReaderDisplayCart({
      currency,
      chargeAmount: amountDue,
      lineItems: lineItems.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });
    if (!cart || lineItems.length === 0) return;

    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await terminal.updateReaderDisplay(cart);
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
    const message = lastError instanceof Error ? lastError.message : t("pos.readerDisplayFailed");
    if (!/not connected/i.test(message)) {
      toast.error(message);
    }
  };

  useEffect(() => {
    if (readerFirmwareUpdating) return;
    void pushCartToReader();
  }, [
    terminal.status,
    terminal.updateReaderDisplay,
    amountDue,
    currency,
    lineItems,
    totals.subtotal,
    totals.taxAmount,
    readerFirmwareUpdating,
  ]);

  const dueSplit = useMemo(
    () => splitPosAmount(amountDue, activeSplit.shopPercent, activeSplit.artistPercent),
    [amountDue, activeSplit],
  );

  const selectedArtist = artists.find((a) => a.user_id === artistId);

  const addQuickItem = (item: PosItemTemplate) => {
    const unitPrice = Number(item.unit_price) || 0;
    const quantity = Math.max(1, Number(item.default_quantity) || 1);
    setCart((prev) => {
      const existing = prev.find((c) => c.templateId === item.id);
      if (existing) {
        return prev.map((c) => (c.templateId === item.id ? { ...c, quantity: c.quantity + quantity } : c));
      }
      return [
        ...prev,
        {
          key: item.id,
          templateId: item.id,
          name: item.name,
          unitPrice,
          quantity,
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

  const addCustomItem = async () => {
    const name = customForm.name.trim();
    const unitPrice = Number(customForm.price);
    const quantity = Math.max(1, parseInt(customForm.quantity, 10) || 1);
    if (!name || Number.isNaN(unitPrice) || unitPrice < 0) {
      toast.error(t("pos.customItemInvalid"));
      return;
    }

    if (saveForQuickAdd) {
      const { error } = await savePosItemTemplate(name, unitPrice, quantity, organizationId);
      if (error) {
        toast.error(error);
      } else {
        toast.success(t("pos.itemSaved"));
        await refreshQuickItems();
      }
    }

    const key = `custom-${Date.now()}`;
    setCart((prev) => [...prev, { key, templateId: null, name, unitPrice, quantity }]);
    setCustomForm({ name: "", price: "", quantity: "1" });
    setCustomOpen(false);
  };

  const finalizeSale = async () => {
    await recordPosItemUsage(
      lineItems.map((item) => ({ name: item.name, unitPrice: item.unitPrice, quantity: item.quantity })),
      organizationId,
    );
    await refreshQuickItems();
    setCart([]);
    setClientName("");
    setLinkedBooking(null);
    await refreshRecentSales();
  };

  const clearCart = () => {
    setCart([]);
    setClientName("");
    setLastSaleId(null);
  };

  const downloadProductsCsvTemplate = () => {
    const csv = ["name,price,quantity", "Small tattoo,120,1", "Touch-up,60,1", "Merchandise,25,1"].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "checkout-products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProductsCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const parsed = parsePosProductsFromCsv(text);
      if (parsed.error === "csv_needs_header") {
        toast.error(t("pos.productsCsvInvalid"));
        return;
      }
      if (parsed.error === "csv_missing_columns") {
        toast.error(t("pos.productsCsvMissingColumns"));
        return;
      }
      if (parsed.error === "csv_no_valid_rows") {
        toast.error(t("pos.productsCsvNoRows"));
        return;
      }
      if (parsed.error === "csv_too_many_rows") {
        toast.error(t("pos.productsCsvTooMany"));
        return;
      }
      if (!organizationId) {
        toast.error(t("pos.productsCsvOrgMissing"));
        return;
      }

      setImportingProducts(true);
      try {
        const { imported, error } = await importPosItemTemplates(parsed.rows, organizationId);
        if (error) {
          toast.error(error);
          return;
        }
        await refreshQuickItems();
        toast.success(t("pos.productsImported", { count: imported }));
      } finally {
        setImportingProducts(false);
      }
    };
    reader.readAsText(file);
    if (productsCsvInputRef.current) productsCsvInputRef.current.value = "";
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
      if (amountDue > 0 && usingTapToPay && terminal.status !== "connected") {
        try {
          await terminal.discoverAndConnect();
        } catch (connectError) {
          throw connectError;
        }
      }

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
        await finalizeSale();
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
      await finalizeSale();
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
                  {settingsReaderLabel(readerMode, simulatedReader, terminal.reader?.label)}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <WifiOff className="h-3 w-3" />
                  {t("pos.readerDisconnected")}
                </Badge>
              )}
            </div>
          </div>

          {isNativeApp() && !simulatedReader ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("pos.readerModeTitle")}</CardTitle>
                <CardDescription>{t("pos.readerModeDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup
                  value={readerMode}
                  onValueChange={(value) => handleReaderModeChange(value as TerminalReaderMode)}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <label
                    htmlFor="reader-mode-bluetooth"
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                      readerMode === "bluetooth" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <RadioGroupItem id="reader-mode-bluetooth" value="bluetooth" className="mt-0.5" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-medium">
                        <Wifi className="h-4 w-4" />
                        {t("pos.readerModeBluetooth")}
                      </div>
                      <p className="text-xs text-muted-foreground">{t("pos.readerModeBluetoothHint")}</p>
                    </div>
                  </label>
                  <label
                    htmlFor="reader-mode-tap-to-pay"
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                      readerMode === "tap_to_pay" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <RadioGroupItem id="reader-mode-tap-to-pay" value="tap_to_pay" className="mt-0.5" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-medium">
                        <Smartphone className="h-4 w-4" />
                        {t("pos.readerModeTapToPay")}
                      </div>
                      <p className="text-xs text-muted-foreground">{t("pos.readerModeTapToPayHint")}</p>
                    </div>
                  </label>
                </RadioGroup>
                {usingTapToPay ? (
                  <>
                    <TapToPayReadinessAlert />
                    {locationId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={testingStripeLink}
                        onClick={() => void testStripeServerLink()}
                      >
                        {testingStripeLink ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                        {t("pos.tapToPayTestStripeLink")}
                      </Button>
                    ) : null}
                    <Alert>
                    <Smartphone className="h-4 w-4" />
                    <AlertTitle>{t("pos.tapToPayInfoTitle")}</AlertTitle>
                    <AlertDescription className="text-sm space-y-2">
                      <p>{t("pos.tapToPayInfoBody")}</p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>{t("pos.tapToPayInfoAppleGoogle")}</li>
                        {nativePlatform() === "android" ? (
                          <li className="font-medium text-amber-800 dark:text-amber-300">{t("pos.tapToPayInfoAndroidDevOptions")}</li>
                        ) : null}
                        <li>{t("pos.tapToPayInfoAndroidRelease")}</li>
                        <li>{t("pos.tapToPayInfoStripeEnable")}</li>
                        {nativePlatform() === "ios" ? <li>{t("pos.tapToPayInfoAppleEntitlement")}</li> : null}
                      </ul>
                      {nativePlatform() === "ios" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="bg-background/80"
                          onClick={() => {
                            void import("@/lib/terminal/tapToPayEducation").then(({ showTapToPayEducationIfAvailable }) =>
                              showTapToPayEducationIfAvailable().then((shown) => {
                                if (!shown) toast.message(t("pos.tapToPayHowToUnavailable"));
                              }),
                            );
                          }}
                        >
                          {t("pos.tapToPayHowToTap")}
                        </Button>
                      ) : null}
                    </AlertDescription>
                    </Alert>
                  </>
                ) : (
                  <p className="text-xs text-emerald-600">{t("pos.nativeBluetoothReady")}</p>
                )}
              </CardContent>
            </Card>
          ) : !simulatedReader ? (
            <p className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/30 p-3">{t("pos.mobileAppRequired")}</p>
          ) : null}

          {usingWisePad && connectReady && locationId ? (
            <WisePadSetupPanels
              terminal={terminal}
              showFirstTimeGuide={showWisePadGuide}
              onDismissGuide={() => {
                dismissWisePadSetupGuide();
                setShowWisePadGuide(false);
              }}
            />
          ) : null}

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
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-lg">{t("pos.services")}</CardTitle>
                      <CardDescription>{t("pos.servicesHint")}</CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 self-start sm:self-auto"
                      onClick={() => setCustomOpen(true)}
                    >
                      {t("pos.addCustomItem")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder={t("pos.searchProductsPlaceholder")}
                      className="pl-9"
                      aria-label={t("pos.searchProductsPlaceholder")}
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 max-h-[min(28rem,50vh)] overflow-y-auto themed-scrollbar pr-1">
                    {filteredQuickItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addQuickItem(item)}
                        className="text-left rounded-xl border border-border bg-card/55 hover:bg-accent/40 transition-colors p-4 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium leading-snug">{item.name}</span>
                          <span className="text-sm font-semibold tabular-nums shrink-0">
                            {formatShopMoney(Number(item.unit_price) || 0, currency)}
                          </span>
                        </div>
                        {item.use_count > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {t("pos.usedCount", { count: item.use_count })}
                          </p>
                        ) : null}
                      </button>
                    ))}
                    {quickItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground col-span-2 py-6 text-center">{t("pos.noServices")}</p>
                    ) : filteredQuickItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground col-span-2 py-6 text-center">{t("pos.noProductsMatch")}</p>
                    ) : null}
                  </div>
                  <div className="border-t border-border pt-4 space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">{t("pos.productsCsvHint")}</p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={productsCsvInputRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={importProductsCsv}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={importingProducts}
                        onClick={() => productsCsvInputRef.current?.click()}
                      >
                        {importingProducts ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Upload className="h-4 w-4 mr-1" />
                        )}
                        {t("pos.importProductsCsv")}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={downloadProductsCsvTemplate}>
                        <Download className="h-4 w-4 mr-1" />
                        {t("pos.downloadProductsTemplate")}
                      </Button>
                    </div>
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
                      <SelectTrigger className="mt-1">
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
                      className="mt-1"
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
                      terminal.status === "discovering" || terminal.status === "connecting" ? (
                        <>
                          <Button type="button" variant="outline" className="w-full" disabled>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            {usingTapToPay ? t("pos.connectTapToPayProgress") : t("pos.connectReaderProgress")}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full text-muted-foreground"
                            onClick={() => void terminal.cancelConnect()}
                          >
                            {t("common.cancel")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          disabled={readerFirmwareUpdating || !canConnectReader || (usingTapToPay && !tapToPayReady.ready)}
                          onClick={() => {
                            if (usingTapToPay && !tapToPayReady.ready) {
                              tapToPayReady.refresh();
                              toast.error(t("pos.tapToPayPhoneBlocked"));
                              return;
                            }
                            if (connectBlockedReason) {
                              toast.error(connectBlockedReason);
                              return;
                            }
                            void terminal
                              .discoverAndConnect()
                              .then(() => {
                                markWisePadFirmwareCompleted();
                                setShowWisePadGuide(false);
                                return pushCartToReader();
                              })
                              .catch((e) => {
                                toast.error(e instanceof Error ? e.message : t("pos.readerDisconnected"));
                              });
                          }}
                        >
                          <Wifi className="h-4 w-4 mr-2" />
                          {usingTapToPay ? t("pos.connectTapToPay") : t("pos.connectReader")}
                        </Button>
                      )
                    ) : (
                      <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" disabled={readerFirmwareUpdating} onClick={() => void terminal.disconnect()}>
                        {t("pos.disconnectReader")}
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="gold"
                      className="w-full h-12 text-base"
                      disabled={paying || readerFirmwareUpdating || cart.length === 0 || !artistId || (amountDue > 0 && terminal.status === "processing")}
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

                  {terminal.error ? (
                    <Alert variant="destructive">
                      <AlertTitle>{usingTapToPay ? t("pos.tapToPayFailed") : t("pos.readerDisconnected")}</AlertTitle>
                      <AlertDescription className="text-sm space-y-2 whitespace-pre-wrap">
                        <p>{terminal.error}</p>
                        {usingTapToPay && /unsupported device|s21|s20|galaxy s2[01]/i.test(terminal.error) ? (
                          <p className="text-xs opacity-90">
                            Galaxy S21 may not support Tap to Pay — switch to WisePad (Bluetooth reader) in the reader mode above, or use a Galaxy S22+ phone.
                          </p>
                        ) : null}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {terminal.status === "connected" && cart.length === 0 && usingWisePad ? (
                    <p className="text-xs text-muted-foreground">{t("pos.readerDisplayHint")}</p>
                  ) : null}
                  {terminal.readerStatus && !readerFirmwareUpdating ? (
                    <p
                      className={
                        terminal.status === "discovering" || terminal.status === "connecting"
                          ? "text-sm font-medium text-foreground"
                          : /firmware|update/i.test(terminal.readerStatus)
                            ? "text-sm font-medium text-amber-700 dark:text-amber-400"
                            : "text-xs text-muted-foreground"
                      }
                    >
                      {terminal.readerStatus}
                    </p>
                  ) : null}

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
                <>
                <div className="hidden md:block overflow-x-auto">
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

                <div className="md:hidden space-y-3">
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
                      <div key={sale.id} className="rounded-xl border border-border bg-card/80 p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{sale.client_name || "—"}</p>
                            {itemSummary ? (
                              <p className="text-xs text-muted-foreground truncate">{itemSummary}</p>
                            ) : null}
                            <p className="text-xs text-muted-foreground mt-1">{artistName}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold tabular-nums">{formatShopMoney(Number(sale.total), sale.currency)}</p>
                            <Badge
                              variant={sale.status === "succeeded" ? "default" : "outline"}
                              className="text-[10px] mt-1 capitalize"
                            >
                              {statusLabel}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground pt-1 border-t border-border/60">
                          <span>
                            {t("pos.paymentSplit")}: {formatShopMoney(Number(sale.shop_amount), sale.currency)} / {formatShopMoney(Number(sale.artist_amount), sale.currency)}
                          </span>
                          <span className="shrink-0">{format(parseISO(sale.created_at), "d MMM HH:mm")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                </>
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
                  className="mt-1"
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
                    className="mt-1"
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
                    className="mt-1"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={saveForQuickAdd} onCheckedChange={(v) => setSaveForQuickAdd(v === true)} />
                <span>{t("pos.saveForQuickAdd")}</span>
              </label>
              <Button type="button" className="w-full" onClick={() => void addCustomItem()}>
                {t("pos.addToOrder")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </SubscriptionGate>
    </AppLayout>
  );
};

function settingsReaderLabel(mode: TerminalReaderMode, simulated: boolean, label?: string) {
  if (label) return label;
  if (simulated) return "Simulated reader";
  if (mode === "tap_to_pay") return "Tap to Pay";
  return "WisePad";
}

export default PosCheckoutPage;

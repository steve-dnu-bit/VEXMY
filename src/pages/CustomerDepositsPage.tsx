import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, parseISO, startOfDay } from "date-fns";
import { toast } from "sonner";
import { buildCustomerBookingsOrFilter } from "@/lib/customerBookings";
import { bookingMatchesCustomerShop } from "@/lib/customerShops";
import { useCustomerShop } from "@/hooks/useCustomerShop";
import { useTranslation } from "react-i18next";
import { loadShopSettingsForOrganization } from "@/lib/shopSettings";
import { currencyForShopCountry, formatShopMoney } from "@/lib/shopCurrency";
import { DEFAULT_DEPOSIT_AMOUNT, loadShopDefaultDepositAmount } from "@/lib/shopDepositSettings";
import { bookingRequiresDeposit } from "@/lib/serviceDeposit";

type BookingDepositRow = {
  id: string;
  organization_id: string | null;
  starts_at: string;
  booking_type: string;
  status: string;
  deposit_paid: boolean | null;
  vip_client: boolean | null;
  deposit_amount: number | null;
};

const CustomerDepositsPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { selectedOrgId, shops, loading: shopLoading } = useCustomerShop();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BookingDepositRow[]>([]);
  const [shopCurrency, setShopCurrency] = useState("gbp");
  const [defaultDeposit, setDefaultDeposit] = useState(DEFAULT_DEPOSIT_AMOUNT);

  const loadDeposits = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user) return;
    if (!opts?.silent) setLoading(true);
    const { data, error } = await supabase
      .from("bookings")
      .select("id, organization_id, starts_at, booking_type, status, deposit_paid, vip_client, deposit_amount")
      .or(buildCustomerBookingsOrFilter(user.id, user.email))
      .order("starts_at", { ascending: true });
    if (error) {
      toast.error(error.message || t("customer.couldNotLoadDeposits"));
      setLoading(false);
      return;
    }
    const allRows = (data as BookingDepositRow[]) || [];
    setRows(
      allRows.filter((b) => bookingMatchesCustomerShop(b.organization_id, selectedOrgId, shops.length)),
    );
    setLoading(false);
  }, [user, t, selectedOrgId, shops.length]);

  useEffect(() => {
    if (!selectedOrgId) return;
    void Promise.all([
      loadShopSettingsForOrganization(selectedOrgId),
      loadShopDefaultDepositAmount(selectedOrgId),
    ]).then(([shop, amount]) => {
      setShopCurrency(currencyForShopCountry(shop?.country));
      setDefaultDeposit(amount);
    });
  }, [selectedOrgId]);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    (async () => {
      if (cancelled) return;
      await loadDeposits();
    })();
    const channel = supabase
      .channel(`customer-deposits-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        void loadDeposits({ silent: true });
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, loadDeposits, selectedOrgId, shops.length]);

  useEffect(() => {
    const status = searchParams.get("status");
    const bookingId = searchParams.get("bookingId");
    const sessionId = searchParams.get("session_id");
    const waitForDepositConfirmation = async (targetBookingId: string) => {
      const maxAttempts = 12;
      for (let i = 0; i < maxAttempts; i += 1) {
        const { data } = await supabase
          .from("bookings")
          .select("id, deposit_paid")
          .eq("id", targetBookingId)
          .maybeSingle();
        const bookingRow = data as Pick<BookingDepositRow, "id" | "deposit_paid"> | null;
        if (bookingRow?.deposit_paid) {
          await loadDeposits({ silent: true });
          return true;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      return false;
    };

    if (status === "success") {
      toast.success(t("customer.paymentReceivedConfirming"));
      if (bookingId && sessionId) {
        const confirmFromStripe = async () => {
          const { data, error } = await supabase.functions.invoke("create-stripe-checkout", {
            body: {
              type: "deposit",
              action: "confirm",
              bookingId,
              sessionId,
            },
          });
          return !error && !!(data as any)?.confirmed;
        };
        void confirmFromStripe().then((confirmedNow) => {
          if (confirmedNow) {
            if (user) void loadDeposits({ silent: true });
            toast.success(t("customer.depositConfirmed"));
            return;
          }
          if (!bookingId) return;
          void waitForDepositConfirmation(bookingId).then((confirmed) => {
            if (confirmed) {
              toast.success(t("customer.depositConfirmed"));
              return;
            }
            toast.message(t("customer.paymentSucceededProcessing"));
            if (user) void loadDeposits({ silent: true });
          });
        });
      } else if (user) {
        void loadDeposits({ silent: true });
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("status");
        next.delete("bookingId");
        next.delete("session_id");
        return next;
      }, { replace: true });
    } else if (status === "cancel") {
      toast.info(t("customer.depositPaymentCancelled"));
      void loadDeposits({ silent: true });
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("status");
        next.delete("bookingId");
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams, user]);

  const today = startOfDay(new Date());
  const upcomingUnpaid = useMemo(
    () =>
      rows.filter(
        (b) => parseISO(b.starts_at) >= today && bookingRequiresDeposit(b, defaultDeposit),
      ),
    [rows, today, defaultDeposit],
  );

  return (
    <CustomerLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-gold">{t("customer.depositPayment")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("customer.depositSubtitle", { amount: formatShopMoney(defaultDeposit, shopCurrency) })}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("customer.upcomingDepositsTitle")}</CardTitle>
            <CardDescription>{t("customer.upcomingDepositsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading || shopLoading ? (
              <p className="text-sm text-muted-foreground">{t("customer.loadingPortal")}</p>
            ) : upcomingUnpaid.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">{t("customer.noUnpaidDeposits")}</p>
            ) : (
              upcomingUnpaid.map((b) => (
                <div key={b.id} className="rounded-lg border border-border p-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{format(parseISO(b.starts_at), "EEE d MMM yyyy, h:mm a")}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.booking_type} · {b.status}</p>
                  </div>
                  {b.vip_client ? (
                    <p className="text-xs text-muted-foreground sm:max-w-[min(100%,300px)] sm:text-right leading-relaxed border border-yellow-500/20 bg-yellow-500/5 rounded-md p-2">
                      {t("depositCheckout.vipExempt")}
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      variant="gold"
                      className="shrink-0 self-start sm:self-center"
                      onClick={() => navigate(`/deposit-payment/checkout?bookingId=${encodeURIComponent(b.id)}`)}
                    >
                      {t("customer.payAmount", {
                        amount: formatShopMoney(b.deposit_amount ?? defaultDeposit, shopCurrency),
                      })}
                    </Button>
                  )}
                </div>
              ))
            )}

            <Button variant="outline" className="w-full" onClick={() => navigate("/account")}>
              {t("customer.backToAccount")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
};

export default CustomerDepositsPage;


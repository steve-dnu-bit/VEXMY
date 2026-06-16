import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { loadShopSettings } from "@/lib/shopSettings";
import { currencyForShopCountry, formatShopMoney } from "@/lib/shopCurrency";
import { DEFAULT_DEPOSIT_AMOUNT, loadShopDefaultDepositAmount } from "@/lib/shopDepositSettings";

type BookingForCheckout = {
  id: string;
  artist_id: string;
  client_name: string;
  starts_at: string;
  booking_type: string;
  status: string;
  deposit_paid: boolean | null;
  vip_client: boolean | null;
  deposit_amount: number | null;
};

const DepositCheckoutPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const bookingId = searchParams.get("bookingId");
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [booking, setBooking] = useState<BookingForCheckout | null>(null);
  const [shopCurrency, setShopCurrency] = useState("gbp");
  const [defaultDeposit, setDefaultDeposit] = useState(DEFAULT_DEPOSIT_AMOUNT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      if (!bookingId) {
        toast.error(t("depositCheckout.missingBookingId"));
        navigate("/deposit-payment", { replace: true });
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("bookings")
        .select("id, artist_id, client_name, starts_at, booking_type, status, deposit_paid, vip_client, deposit_amount")
        .eq("id", bookingId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        toast.error(error.message || t("depositCheckout.loadBookingFailed"));
        navigate("/deposit-payment", { replace: true });
        return;
      }
      setBooking((data as BookingForCheckout) || null);
      const [shop, shopDefault] = await Promise.all([loadShopSettings(), loadShopDefaultDepositAmount()]);
      setShopCurrency(currencyForShopCountry(shop?.country));
      setDefaultDeposit(shopDefault);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, navigate, user, t]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </div>
    );
  }

  const depositAmount = booking ? (booking.deposit_amount ?? defaultDeposit) : defaultDeposit;
  const formattedDeposit = formatShopMoney(depositAmount, shopCurrency);

  return (
    <CustomerLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-gold">{t("depositCheckout.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("depositCheckout.subtitle")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("depositCheckout.depositTitle")}</CardTitle>
            <CardDescription>{t("depositCheckout.depositDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("depositCheckout.loadingBooking")}</p>
            ) : !booking ? (
              <p className="text-sm text-muted-foreground">{t("depositCheckout.bookingNotFound")}</p>
            ) : (
              <>
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="font-semibold">{format(parseISO(booking.starts_at), "EEE d MMM yyyy, h:mm a")}</p>
                  <p className="text-sm text-muted-foreground">
                    {booking.booking_type} · {booking.status}
                  </p>
                  {booking.vip_client && !booking.deposit_paid ? (
                    <p className="text-sm mt-3 leading-relaxed border border-yellow-500/25 bg-yellow-500/10 rounded-md p-3 text-foreground/90">
                      {t("depositCheckout.vipExempt")}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm mt-2">
                        {t("depositCheckout.amount")}{" "}
                        <span className="font-semibold">{formattedDeposit}</span>
                      </p>
                      {booking.deposit_paid ? (
                        <p className="text-xs text-primary mt-1">{t("depositCheckout.alreadyPaid")}</p>
                      ) : null}
                    </>
                  )}
                </div>

                {!booking.deposit_paid && !booking.vip_client ? (
                  <Button
                    variant="gold"
                    className="w-full"
                    disabled={redirecting}
                    onClick={async () => {
                      if (!bookingId) return;
                      setRedirecting(true);
                      const { data, error } = await invokeEdgeFunctionJson("create-stripe-checkout", {
                        type: "deposit",
                        bookingId,
                      });
                      if (error || !(data as any)?.checkoutUrl) {
                        setRedirecting(false);
                        toast.error((data as any)?.error || error?.message || t("depositCheckout.checkoutFailed"));
                        return;
                      }
                      window.location.href = (data as any).checkoutUrl as string;
                    }}
                  >
                    {redirecting
                      ? t("depositCheckout.redirecting")
                      : t("depositCheckout.payDeposit", { amount: formattedDeposit })}
                  </Button>
                ) : null}

                <Button variant="outline" className="w-full" onClick={() => navigate("/deposit-payment")}>
                  {t("depositCheckout.backToDeposits")}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
};

export default DepositCheckoutPage;

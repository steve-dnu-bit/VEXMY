import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { VIP_DEPOSIT_EXEMPT_MESSAGE } from "@/lib/vipDepositCopy";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";

type BookingForCheckout = {
  id: string;
  artist_id: string;
  client_name: string;
  starts_at: string;
  booking_type: string;
  status: string;
  deposit_paid: boolean | null;
  vip_client: boolean | null;
};

const DEPOSIT_GBP = 50;

const DepositCheckoutPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const bookingId = searchParams.get("bookingId");
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [booking, setBooking] = useState<BookingForCheckout | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      if (!bookingId) {
        toast.error("Missing booking id");
        navigate("/deposit-payment", { replace: true });
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("bookings")
        .select("id, artist_id, client_name, starts_at, booking_type, status, deposit_paid, vip_client")
        .eq("id", bookingId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        toast.error(error.message || "Could not load booking");
        navigate("/deposit-payment", { replace: true });
        return;
      }
      setBooking((data as BookingForCheckout) || null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, navigate, user]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <CustomerLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-gold">Checkout</h1>
          <p className="text-sm text-muted-foreground mt-1">Pay your deposit to secure your booking</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deposit</CardTitle>
            <CardDescription>Fixed deposit amount</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading booking…</p>
            ) : !booking ? (
              <p className="text-sm text-muted-foreground">Booking not found.</p>
            ) : (
              <>
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="font-semibold">{format(parseISO(booking.starts_at), "EEE d MMM yyyy, h:mm a")}</p>
                  <p className="text-sm text-muted-foreground">
                    {booking.booking_type} · {booking.status}
                  </p>
                  {booking.vip_client && !booking.deposit_paid ? (
                    <p className="text-sm mt-3 leading-relaxed border border-yellow-500/25 bg-yellow-500/10 rounded-md p-3 text-foreground/90">
                      {VIP_DEPOSIT_EXEMPT_MESSAGE}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm mt-2">
                        Amount: <span className="font-semibold">£{DEPOSIT_GBP}</span>
                      </p>
                      {booking.deposit_paid ? (
                        <p className="text-xs text-primary mt-1">Deposit already marked as paid.</p>
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
                        toast.error((data as any)?.error || error?.message || "Could not start Stripe checkout");
                        return;
                      }
                      window.location.href = (data as any).checkoutUrl as string;
                    }}
                  >
                    {redirecting ? "Redirecting to Stripe..." : `Pay £${DEPOSIT_GBP} deposit`}
                  </Button>
                ) : null}

                <Button variant="outline" className="w-full" onClick={() => navigate("/deposit-payment")}>
                  Back to deposit payment
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


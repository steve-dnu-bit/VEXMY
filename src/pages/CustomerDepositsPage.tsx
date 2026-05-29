import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, parseISO, startOfDay } from "date-fns";
import { toast } from "sonner";
import { VIP_DEPOSIT_EXEMPT_MESSAGE } from "@/lib/vipDepositCopy";

type BookingDepositRow = {
  id: string;
  starts_at: string;
  booking_type: string;
  status: string;
  deposit_paid: boolean | null;
  vip_client: boolean | null;
};

const DEPOSIT_GBP = 50;

const CustomerDepositsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BookingDepositRow[]>([]);

  const loadDeposits = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user) return;
    if (!opts?.silent) setLoading(true);
    const { data, error } = await supabase
      .from("bookings")
      .select("id, starts_at, booking_type, status, deposit_paid, vip_client")
      .eq("client_user_id", user.id)
      .order("starts_at", { ascending: true });
    if (error) {
      toast.error(error.message || "Could not load deposits");
      setLoading(false);
      return;
    }
    setRows((data as BookingDepositRow[]) || []);
    setLoading(false);
  }, [user]);

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
  }, [user]);

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
          .eq("client_user_id", user?.id || "")
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
      toast.success("Payment received. Confirming your deposit...");
      if (bookingId && user) {
        const confirmFromStripe = async () => {
          if (!sessionId) return false;
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
            void loadDeposits({ silent: true });
            toast.success("Deposit confirmed.");
            return;
          }
          void waitForDepositConfirmation(bookingId).then((confirmed) => {
            if (confirmed) {
              toast.success("Deposit confirmed.");
              return;
            }
            toast.message("Payment succeeded, but confirmation is still processing. This page will update automatically.");
            void loadDeposits({ silent: true });
          });
        });
      } else {
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
      toast.info("Deposit payment cancelled.");
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
    () => rows.filter((b) => parseISO(b.starts_at) >= today && !b.deposit_paid),
    [rows, today]
  );

  return (
    <CustomerLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-gradient-gold">Deposit payment</h1>
          <p className="text-sm text-muted-foreground mt-1">Pay your £{DEPOSIT_GBP} deposit to secure your booking</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming deposits</CardTitle>
            <CardDescription>Only bookings with an unpaid deposit are shown here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : upcomingUnpaid.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">No unpaid deposits right now.</p>
            ) : (
              upcomingUnpaid.map((b) => (
                <div key={b.id} className="rounded-lg border border-border p-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{format(parseISO(b.starts_at), "EEE d MMM yyyy, h:mm a")}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.booking_type} · {b.status}</p>
                  </div>
                  {b.vip_client ? (
                    <p className="text-xs text-muted-foreground sm:max-w-[min(100%,300px)] sm:text-right leading-relaxed border border-yellow-500/20 bg-yellow-500/5 rounded-md p-2">
                      {VIP_DEPOSIT_EXEMPT_MESSAGE}
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      variant="gold"
                      className="shrink-0 self-start sm:self-center"
                      onClick={() => navigate(`/deposit-payment/checkout?bookingId=${encodeURIComponent(b.id)}`)}
                    >
                      Pay £{DEPOSIT_GBP}
                    </Button>
                  )}
                </div>
              ))
            )}

            <Button variant="outline" className="w-full" onClick={() => navigate("/account")}>
              Back to account
            </Button>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
};

export default CustomerDepositsPage;


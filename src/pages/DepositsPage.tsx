import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, isAfter, parseISO, startOfDay, subDays } from "date-fns";
import { Send, CheckCircle, Clock, AlertCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";

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
  const [bookings, setBookings] = useState<BookingWithDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
  /**
   * Only load bookings from this many days ago onward (plus all future).
   * Querying the whole table hits the ~1000 row cap and returns the *oldest* rows first — wrong for deposits.
   */
  const [daysBack, setDaysBack] = useState<14 | 90>(14);

  useEffect(() => {
    fetchBookings();
  }, [daysBack]);

  useEffect(() => {
    const channel = supabase
      .channel("deposits-bookings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        fetchBookings();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [daysBack]);

  const fetchBookings = async () => {
    setLoading(true);
    const from = startOfDay(subDays(new Date(), daysBack));
    const { data, error } = await supabase
      .from("bookings")
      .select("id, client_name, client_email, client_phone, starts_at, deposit_amount, deposit_paid, deposit_link_sent, deposit_payment_id, vip_client, booking_type, status")
      .gte("starts_at", from.toISOString())
      .order("starts_at", { ascending: true });
    if (error) {
      toast.error(error.message || "Could not load bookings");
      setBookings([]);
      setLoading(false);
      return;
    }
    setBookings((data as BookingWithDeposit[]) || []);
    setLoading(false);
  };

  const handleSendDepositLink = async (booking: BookingWithDeposit) => {
    if (!booking.client_email && !booking.client_phone) {
      toast.error("No contact info — add email or phone to send deposit link");
      return;
    }
    if (!booking.client_email) {
      toast.error("No client email on this booking. Deposit reminder email cannot be sent.");
      return;
    }
    const { data, error } = await invokeEdgeFunctionJson("create-stripe-checkout", {
      type: "deposit",
      bookingId: booking.id,
      sendEmail: true,
    });
    if (error || !(data as any)?.checkoutUrl) {
      toast.error((data as any)?.error || error?.message || "Failed to generate deposit link");
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
      } else {
        toast.error(
          emailAttempted
            ? `Deposit link created and copied, but email was not sent: ${emailFailureMessage}`
            : "Deposit link created and copied, but email send was not attempted.",
        );
      }
    } catch {
      if (emailSent) {
        toast.success("Deposit reminder email sent");
      } else {
        toast.error(
          emailAttempted
            ? `Deposit link created, but email was not sent: ${emailFailureMessage}`
            : "Deposit link created, but email send was not attempted.",
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
    toast.success("Deposit marked as paid");
    fetchBookings();
  };

  const handleMarkUnpaid = async (bookingId: string) => {
    await supabase
      .from("bookings")
      .update({ deposit_paid: false } as any)
      .eq("id", bookingId);
    toast.success("Deposit marked as unpaid");
    fetchBookings();
  };

  const handleToggleVip = async (booking: BookingWithDeposit) => {
    const nextVip = !booking.vip_client;
    const { error } = await supabase.from("bookings").update({ vip_client: nextVip } as any).eq("id", booking.id);
    if (error) {
      toast.error(error.message || "Could not update VIP");
      return;
    }
    toast.success(nextVip ? "Marked VIP for this booking" : "VIP removed");
    fetchBookings();
  };

  const isUpcomingBooking = useCallback((startsAt: string) => isAfter(parseISO(startsAt), new Date()), []);

  /** Filter + sort: upcoming = soonest first; past = most recent past first; all = closest to “now” in time. */
  const filteredBookings = useMemo(() => {
    const now = new Date().getTime();
    const upcoming = bookings.filter((b) => isUpcomingBooking(b.starts_at));
    const past = bookings.filter((b) => !isUpcomingBooking(b.starts_at));

    let list: BookingWithDeposit[];
    if (timeFilter === "upcoming") {
      list = upcoming;
      list = [...list].sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime());
    } else if (timeFilter === "past") {
      list = past;
      list = [...list].sort((a, b) => parseISO(b.starts_at).getTime() - parseISO(a.starts_at).getTime());
    } else {
      list = [...bookings].sort((a, b) => {
        const da = Math.abs(parseISO(a.starts_at).getTime() - now);
        const db = Math.abs(parseISO(b.starts_at).getTime() - now);
        if (da !== db) return da - db;
        return parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime();
      });
    }
    return list;
  }, [bookings, timeFilter, isUpcomingBooking]);

  const unpaidCount = bookings.filter((b) => !b.deposit_paid).length;
  const paidCount = bookings.filter((b) => !!b.deposit_paid).length;
  const upcomingCount = bookings.filter((b) => isUpcomingBooking(b.starts_at)).length;
  const totalCollected = bookings
    .filter((b) => !!b.deposit_paid)
    .reduce((sum, b) => sum + (b.deposit_amount || 50), 0);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Deposits</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage booking deposits — send payment links via email or SMS</p>
            {!loading && (
              <p className="text-xs text-muted-foreground mt-1">
                Showing appointments from <span className="text-foreground font-medium">{daysBack} days</span> ago through future (not the whole client import history).
              </p>
            )}
          </div>
          <Button
            variant={daysBack === 90 ? "secondary" : "outline"}
            size="sm"
            className="shrink-0"
            onClick={() => setDaysBack((d) => (d === 14 ? 90 : 14))}
          >
            {daysBack === 14 ? "Wider window (90 days)" : "Default window (14 days)"}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">In window</p>
              <p className="text-2xl font-display font-bold mt-1">{bookings.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Deposits Paid</p>
              <p className="text-2xl font-display font-bold text-emerald-400 mt-1">{paidCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending</p>
              <p className="text-2xl font-display font-bold text-amber-400 mt-1">{unpaidCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Upcoming</p>
              <p className="text-2xl font-display font-bold mt-1">{upcomingCount}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" /> Deposits List
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              One row per appointment. Deposit shows paid or pending. Sort is nearest to today first.
            </p>
            <Tabs value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)} className="mt-3 w-full max-w-md">
              <TabsList className="grid w-full grid-cols-3 h-9">
                <TabsTrigger value="upcoming" className="text-xs sm:text-sm">
                  Upcoming
                </TabsTrigger>
                <TabsTrigger value="past" className="text-xs sm:text-sm">
                  Past
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs sm:text-sm">
                  All
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-[11px] text-muted-foreground mt-2">
              Showing {filteredBookings.length} of {bookings.length} in the date window
              {timeFilter === "upcoming" ? " · next appointment first" : timeFilter === "past" ? " · most recent past first" : " · closest to today first"}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="text-sm text-muted-foreground p-4">Loading bookings…</p>
            ) : bookings.length === 0 ? (
              <div className="p-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  No appointments in this date window. Try “Wider window (90 days)” or add a booking on Schedule.
                </p>
                {daysBack === 14 ? (
                  <Button size="sm" variant="secondary" onClick={() => setDaysBack(90)}>
                    Load last 90 days + future
                  </Button>
                ) : null}
              </div>
            ) : filteredBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">
                {timeFilter === "upcoming"
                  ? "No upcoming appointments in this window."
                  : timeFilter === "past"
                    ? "No past appointments in this window."
                    : "No appointments to show."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead>Deposit</TableHead>
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead>Paid?</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
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
                              Upcoming
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] mt-1">
                              Past
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{b.client_name}</span>
                            {b.vip_client ? (
                              <Badge className="text-[10px] bg-yellow-500/15 text-yellow-300 border-yellow-500/30">VIP</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{b.booking_type}</TableCell>
                        <TableCell>£{b.deposit_amount ?? 50}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex gap-1 flex-wrap">
                            {b.client_email && <Badge variant="outline" className="text-[10px]">Email</Badge>}
                            {b.client_phone && <Badge variant="outline" className="text-[10px]">SMS</Badge>}
                            {!b.client_email && !b.client_phone && (
                              <span className="text-[10px] text-destructive">No contact</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {b.deposit_paid ? (
                            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25 text-[10px]">Paid</Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-200 border-amber-500/25 text-[10px]">Pending</Badge>
                          )}
                          {b.deposit_link_sent && !b.deposit_paid ? (
                            <div className="text-[10px] text-muted-foreground mt-0.5">Link sent</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end flex-col sm:flex-row">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleSendDepositLink(b)}>
                              <Send className="h-3 w-3" /> Reminder
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleMarkPaid(b.id)} disabled={!!b.deposit_paid}>
                              <CheckCircle className="h-3 w-3" /> Paid
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleMarkUnpaid(b.id)} disabled={!b.deposit_paid}>
                              Unpaid
                            </Button>
                            <Button
                              size="sm"
                              variant={b.vip_client ? "secondary" : "outline"}
                              className="h-7 text-xs gap-1"
                              onClick={() => handleToggleVip(b)}
                            >
                              <Star className="h-3 w-3" /> VIP
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

        {/* Stripe reconciliation note */}
        <Card className="border-amber-500/25 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Stripe deposit links enabled</p>
              <p className="text-xs text-muted-foreground mt-1">
                "Reminder" creates a live Stripe checkout URL and emails it to the client (if SMTP is configured). Payments are auto-reconciled when Stripe webhook is configured.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default DepositsPage;

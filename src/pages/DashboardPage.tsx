import { useEffect, useState } from "react";
import { Calendar, Users, MessageSquare, FileSignature, Eye, CreditCard, Receipt, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DashboardPage = () => {
  const { user } = useAuth();
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

    const { count: mCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false);
    setMessageCount(mCount || 0);

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
    { label: "Today's Bookings", value: String(bookingCount), icon: Calendar },
    { label: "Unread Messages", value: String(messageCount), icon: MessageSquare },
  ];

  return (
    <AppLayout>
      <div className="p-4 md:p-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold">
            <span className="text-gradient-gold">Dashboard</span>
          </h1>
          <p className="text-sm text-muted-foreground">Welcome back. Here's your overview.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="font-display text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold mb-4">Today's Bookings</h2>
          {recentBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No bookings today</p>
          ) : (
            <div className="space-y-2">
              {recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary p-3">
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

        <div className="rounded-xl border border-border bg-card p-5 mt-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-display text-lg font-semibold">Stripe Verification</h2>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <CheckCircle2 className="h-4 w-4" />
              Last 30 days
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 mb-4">
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Receipt className="h-4 w-4" />
                Paid invoices
              </div>
              <p className="font-display text-2xl font-bold mt-1">{stripeInvoicePaidCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CreditCard className="h-4 w-4" />
                Invoice value paid
              </div>
              <p className="font-display text-2xl font-bold mt-1">£{stripeInvoicePaidValue.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Deposits paid
              </div>
              <p className="font-display text-2xl font-bold mt-1">{stripeDepositPaidCount}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              <p className="text-sm font-semibold mb-2">Recent paid invoices</p>
              {recentPaidInvoices.length === 0 ? (
                <p className="text-xs text-muted-foreground">No paid invoices in the last 30 days.</p>
              ) : (
                <div className="space-y-2">
                  {recentPaidInvoices.map((inv) => (
                    <div key={inv.id} className="rounded-md border border-border bg-card px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{inv.invoice_number} · {inv.client_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.paid_at ? new Date(inv.paid_at).toLocaleString() : "Paid"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">£{Number(inv.total || 0).toFixed(2)}</p>
                        <Badge variant={inv.stripe_payment_intent_id ? "default" : "outline"} className="text-[10px]">
                          {inv.stripe_payment_intent_id ? "Stripe" : "Manual"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              <p className="text-sm font-semibold mb-2">Recent paid deposits</p>
              {recentPaidDeposits.length === 0 ? (
                <p className="text-xs text-muted-foreground">No paid deposits in the last 30 days.</p>
              ) : (
                <div className="space-y-2">
                  {recentPaidDeposits.map((dep) => (
                    <div key={dep.id} className="rounded-md border border-border bg-card px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{dep.client_name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(dep.starts_at).toLocaleString()}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">£{Number(dep.deposit_amount ?? 50).toFixed(2)}</p>
                        <Badge
                          variant={dep.deposit_payment_id && !dep.deposit_payment_id.startsWith("manual_") ? "default" : "outline"}
                          className="text-[10px]"
                        >
                          {dep.deposit_payment_id && !dep.deposit_payment_id.startsWith("manual_") ? "Stripe" : "Manual"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-display text-lg font-semibold">Consents</h2>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <FileSignature className="h-4 w-4" />
              Latest submissions
            </div>
          </div>

          {recentConsents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No consent submissions yet</p>
          ) : (
            <div className="space-y-2">
              {recentConsents.map((c) => {
                const submitted = new Date(c.created_at);
                const bookingTime = c.bookingStartsAt ? new Date(c.bookingStartsAt) : null;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {bookingTime ? bookingTime.toLocaleDateString() : "Booking"} ·{" "}
                        {c.artistName ? c.artistName : "Artist"}
                      </p>
                      <p className="text-[11px] text-muted-foreground break-all">
                        {c.email || c.phone || "—"} · Submitted {submitted.toLocaleDateString()}{" "}
                      </p>
                    </div>

                    {c.consent_pdf_url ? (
                      <a href={c.consent_pdf_url} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline" className="h-8">
                          <Eye className="h-4 w-4 mr-2" />
                          View PDF
                        </Button>
                      </a>
                    ) : (
                      <div className="text-xs text-muted-foreground whitespace-nowrap">PDF pending</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default DashboardPage;

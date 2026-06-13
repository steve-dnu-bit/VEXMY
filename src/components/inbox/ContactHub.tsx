import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Calendar, Loader2, Mail, MessageCircle, Phone, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ExternalMessageActions from "@/components/messaging/ExternalMessageActions";

type BookingContact = {
  id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  starts_at: string;
  deposit_paid: boolean | null;
};

type ClientRow = {
  name: string;
  email: string | null;
  phone: string | null;
  bookingCount: number;
  nextBookingAt: string | null;
};

type ContactTemplateId = "general" | "bookingConfirm" | "deposit" | "aftercare";

function contactKey(name: string, email: string | null, phone: string | null): string {
  return `${name}|${email ?? ""}|${phone ?? ""}`;
}

export default function ContactHub() {
  const { t } = useTranslation();
  const [bookings, setBookings] = useState<BookingContact[]>([]);
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState<ContactTemplateId>("general");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data: bookingRows } = await supabase
        .from("bookings")
        .select("id, client_name, client_email, client_phone, starts_at, deposit_paid")
        .order("starts_at", { ascending: false })
        .limit(300);

      const filtered = (bookingRows || []).filter(
        (b: BookingContact) => b.client_email || b.client_phone,
      ) as BookingContact[];
      setBookings(filtered);
      setLoading(false);
    })();
  }, []);

  const clients = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, ClientRow>();
    bookings.forEach((b) => {
      const key = contactKey(b.client_name, b.client_email, b.client_phone);
      const isFuture = new Date(b.starts_at).getTime() >= now;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          name: b.client_name,
          email: b.client_email,
          phone: b.client_phone,
          bookingCount: 1,
          nextBookingAt: isFuture ? b.starts_at : null,
        });
        return;
      }
      existing.bookingCount += 1;
      if (isFuture && (!existing.nextBookingAt || b.starts_at < existing.nextBookingAt)) {
        existing.nextBookingAt = b.starts_at;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [bookings]);

  const upcomingBookings = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((b) => new Date(b.starts_at).getTime() >= now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 12);
  }, [bookings]);

  const stats = useMemo(() => {
    const withPhone = clients.filter((c) => c.phone).length;
    const withEmail = clients.filter((c) => c.email).length;
    const weekAhead = new Date();
    weekAhead.setDate(weekAhead.getDate() + 7);
    const upcomingWeek = upcomingBookings.filter((b) => new Date(b.starts_at) <= weekAhead).length;
    return { total: clients.length, withPhone, withEmail, upcomingWeek };
  }, [clients, upcomingBookings]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").includes(q),
    );
  }, [clients, search]);

  const buildMessages = (name: string, startsAt?: string) => {
    const date = startsAt ? format(parseISO(startsAt), "EEE d MMM") : undefined;
    const time = startsAt ? format(parseISO(startsAt), "h:mm a") : undefined;
    const ctx = { name, date: date ?? "", time: time ?? "" };

    if (template === "bookingConfirm") {
      return {
        body: t("unifiedInbox.templateBookingBody", ctx),
        subject: t("unifiedInbox.templateBookingSubject", { name }),
      };
    }
    if (template === "deposit") {
      return {
        body: t("unifiedInbox.templateDepositBody", ctx),
        subject: t("unifiedInbox.templateDepositSubject", { name }),
      };
    }
    if (template === "aftercare") {
      return {
        body: t("unifiedInbox.templateAftercareBody", { name }),
        subject: t("unifiedInbox.templateAftercareSubject", { name }),
      };
    }
    return {
      body: t("unifiedInbox.templateGeneralBody", { name }),
      subject: t("unifiedInbox.templateGeneralSubject", { name }),
    };
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">{t("unifiedInbox.contactTitle")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("unifiedInbox.contactSubtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["reminders", "aftercare", "templates", "channels"] as const).map((key) => (
          <Badge key={key} variant="secondary" className="text-xs font-normal">
            {t(`unifiedInbox.starterIncludes.${key}`)}
          </Badge>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border/70 bg-card/55 p-4">
          <Users className="mb-2 h-4 w-4 text-primary" />
          <p className="font-display text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">{t("unifiedInbox.statClients")}</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-card/55 p-4">
          <MessageCircle className="mb-2 h-4 w-4 text-emerald-400" />
          <p className="font-display text-2xl font-bold">{stats.withPhone}</p>
          <p className="text-xs text-muted-foreground">{t("unifiedInbox.statWhatsApp")}</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-card/55 p-4">
          <Mail className="mb-2 h-4 w-4 text-blue-400" />
          <p className="font-display text-2xl font-bold">{stats.withEmail}</p>
          <p className="text-xs text-muted-foreground">{t("unifiedInbox.statEmail")}</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-card/55 p-4">
          <Calendar className="mb-2 h-4 w-4 text-gold" />
          <p className="font-display text-2xl font-bold">{stats.upcomingWeek}</p>
          <p className="text-xs text-muted-foreground">{t("unifiedInbox.statUpcoming")}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("unifiedInbox.templateLabel")}</p>
          <p className="text-xs text-muted-foreground">{t("unifiedInbox.templateHint")}</p>
        </div>
        <Select value={template} onValueChange={(v) => setTemplate(v as ContactTemplateId)}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">{t("unifiedInbox.templateGeneral")}</SelectItem>
            <SelectItem value="bookingConfirm">{t("unifiedInbox.templateBooking")}</SelectItem>
            <SelectItem value="deposit">{t("unifiedInbox.templateDeposit")}</SelectItem>
            <SelectItem value="aftercare">{t("unifiedInbox.templateAftercare")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h3 className="font-display text-lg font-semibold">{t("unifiedInbox.upcomingTitle")}</h3>
            {upcomingBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("unifiedInbox.noUpcoming")}</p>
            ) : (
              <div className="grid gap-3">
                {upcomingBookings.map((b) => {
                  const messages = buildMessages(b.client_name, b.starts_at);
                  return (
                    <div
                      key={b.id}
                      className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card/55 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">{b.client_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(b.starts_at), "EEE d MMM · h:mm a")}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {b.client_phone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {b.client_phone}
                            </span>
                          ) : null}
                          {b.client_email ? (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {b.client_email}
                            </span>
                          ) : null}
                          {b.deposit_paid === false ? (
                            <Badge variant="outline" className="text-[10px]">
                              {t("unifiedInbox.depositPending")}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <ExternalMessageActions
                        phone={b.client_phone}
                        email={b.client_email}
                        whatsAppMessage={messages.body}
                        smsMessage={messages.body}
                        emailSubject={messages.subject}
                        emailBody={messages.body}
                        layout="column"
                        className="sm:min-w-[11rem]"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-display text-lg font-semibold">{t("unifiedInbox.allClientsTitle")}</h3>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("unifiedInbox.searchClients")}
              className="max-w-md"
            />
            {filteredClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("unifiedInbox.noClients")}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredClients.map((c) => {
                  const messages = buildMessages(c.name, c.nextBookingAt ?? undefined);
                  return (
                    <div
                      key={contactKey(c.name, c.email, c.phone)}
                      className="space-y-3 rounded-lg border border-border/70 bg-card/55 p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.bookingCount === 1
                              ? t("unifiedInbox.oneBooking")
                              : t("unifiedInbox.bookingCount", { count: c.bookingCount })}
                          </p>
                        </div>
                        {c.nextBookingAt ? (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {format(parseISO(c.nextBookingAt), "d MMM")}
                          </Badge>
                        ) : null}
                      </div>
                      <ExternalMessageActions
                        phone={c.phone}
                        email={c.email}
                        whatsAppMessage={messages.body}
                        smsMessage={messages.body}
                        emailSubject={messages.subject}
                        emailBody={messages.body}
                        layout="column"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, Loader2, MessageSquare, Search, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { SupportTicketRow, SupportTicketMessageRow } from "@/lib/supportTickets";
import { ticketCategoryLabelKey } from "@/lib/supportTickets";

type TicketWithCustomer = SupportTicketRow & {
  customer_name?: string | null;
};

type Props = {
  highlightCustomerId?: string;
  highlightTicketId?: string;
};

export default function StaffTicketsPanel({ highlightCustomerId, highlightTicketId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketWithCustomer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessageRow[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<"open" | "closed" | "all">("open");
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("support_tickets" as any)
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (highlightCustomerId) query = query.eq("customer_id", highlightCustomerId);

    const { data, error } = await query;
    if (error) {
      toast.error(t("tickets.loadFailed"));
      setLoading(false);
      return;
    }

    const rows = (data || []) as SupportTicketRow[];
    const customerIds = [...new Set(rows.map((r) => r.customer_id))];
    const names: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", customerIds);
      (profiles || []).forEach((p) => {
        if (p.user_id) names[p.user_id] = p.display_name || t("tickets.customer");
      });
    }

    setTickets(rows.map((row) => ({ ...row, customer_name: names[row.customer_id] || null })));
    setLoading(false);
  }, [highlightCustomerId, statusFilter, t]);

  const loadMessages = useCallback(
    async (ticketId: string) => {
      const { data, error } = await supabase
        .from("support_ticket_messages" as any)
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) {
        toast.error(t("tickets.loadFailed"));
        return;
      }

      const rows = (data || []) as SupportTicketMessageRow[];
      setMessages(rows);

      const senderIds = [...new Set(rows.map((m) => m.sender_id))];
      const missing = senderIds.filter((id) => !profileNames[id]);
      if (missing.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", missing);
        const next = { ...profileNames };
        (profiles || []).forEach((p) => {
          if (p.user_id) next[p.user_id] = p.display_name || t("tickets.participant");
        });
        setProfileNames(next);
      }
    },
    [profileNames, t],
  );

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (highlightTicketId && tickets.some((tk) => tk.id === highlightTicketId)) {
      setSelectedId(highlightTicketId);
      return;
    }
    if (highlightCustomerId && tickets.length > 0 && !selectedId) {
      setSelectedId(tickets[0].id);
    }
  }, [highlightTicketId, highlightCustomerId, tickets, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);

    const channel = supabase
      .channel(`staff-ticket-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${selectedId}` },
        () => {
          void loadMessages(selectedId);
          void loadTickets();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${selectedId}` },
        () => {
          void loadTickets();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedId, loadMessages, loadTickets]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (tk) =>
        tk.subject.toLowerCase().includes(q) ||
        (tk.customer_name || "").toLowerCase().includes(q) ||
        tk.category.toLowerCase().includes(q),
    );
  }, [tickets, search]);

  const activeTicket = tickets.find((tk) => tk.id === selectedId) || null;

  const sendReply = async () => {
    if (!selectedId || !user || !replyText.trim()) return;
    setSending(true);
    const { error } = await supabase.from("support_ticket_messages" as any).insert({
      ticket_id: selectedId,
      sender_id: user.id,
      body: replyText.trim(),
    });
    setSending(false);
    if (error) {
      toast.error(t("tickets.replyFailed"));
      return;
    }
    setReplyText("");
    toast.success(t("tickets.replySent"));
  };

  const closeTicket = async () => {
    if (!selectedId) return;
    setClosing(true);
    const { error } = await supabase
      .from("support_tickets" as any)
      .update({ status: "closed" })
      .eq("id", selectedId);
    setClosing(false);
    if (error) {
      toast.error(t("tickets.closeFailed"));
      return;
    }
    toast.success(t("tickets.closed"));
    void loadTickets();
  };

  const reopenTicket = async () => {
    if (!selectedId) return;
    setClosing(true);
    const { error } = await supabase
      .from("support_tickets" as any)
      .update({ status: "open" })
      .eq("id", selectedId);
    setClosing(false);
    if (error) {
      toast.error(t("tickets.reopenFailed"));
      return;
    }
    toast.success(t("tickets.reopened"));
    void loadTickets();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-3 rounded-lg border border-border/70 bg-card/55 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{t("tickets.staffTitle")}</h2>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void loadTickets()}>
            {t("tickets.refresh")}
          </Button>
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">{t("tickets.filterOpen")}</SelectItem>
            <SelectItem value="closed">{t("tickets.filterClosed")}</SelectItem>
            <SelectItem value="all">{t("tickets.filterAll")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("tickets.searchPlaceholder")}
            className="pl-9 h-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTickets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("tickets.noTickets")}</p>
        ) : (
          <div className="max-h-[28rem] space-y-2 overflow-y-auto">
            {filteredTickets.map((tk) => {
              const active = tk.id === selectedId;
              return (
                <button
                  key={tk.id}
                  type="button"
                  onClick={() => setSelectedId(tk.id)}
                  className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                    active ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background/40 hover:bg-secondary/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium line-clamp-2">{tk.subject}</p>
                    <Badge variant={tk.status === "open" ? "default" : "secondary"} className="shrink-0 text-[10px]">
                      {tk.status === "open" ? t("tickets.open") : t("tickets.closedLabel")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{tk.customer_name || t("tickets.customer")}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {format(parseISO(tk.last_message_at || tk.created_at), "d MMM · HH:mm")} ·{" "}
                    {t(ticketCategoryLabelKey(tk.category))}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex min-h-[24rem] flex-col rounded-lg border border-border/70 bg-card/55">
        {!activeTicket ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm">{t("tickets.selectTicket")}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-4">
              <div className="min-w-0 space-y-1">
                <h3 className="font-display text-lg font-semibold">{activeTicket.subject}</h3>
                <p className="text-xs text-muted-foreground">
                  {activeTicket.customer_name || t("tickets.customer")} · {t(ticketCategoryLabelKey(activeTicket.category))}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeTicket.status === "open" ? (
                  <Button variant="outline" size="sm" className="h-8 gap-1" disabled={closing} onClick={() => void closeTicket()}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t("tickets.closeTicket")}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 gap-1" disabled={closing} onClick={() => void reopenTicket()}>
                    <XCircle className="h-3.5 w-3.5" />
                    {t("tickets.reopenTicket")}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4 min-h-0">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-md px-3 py-2 text-sm ${
                    m.sender_id === user?.id ? "ml-8 bg-primary/15" : "mr-8 bg-secondary"
                  }`}
                >
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">
                    {profileNames[m.sender_id] || (m.sender_id === activeTicket.customer_id ? t("tickets.customer") : t("tickets.staff"))}
                  </p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{format(parseISO(m.created_at), "d MMM · HH:mm")}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {activeTicket.status === "open" ? (
              <div className="border-t border-border/60 p-3 space-y-2">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={t("tickets.replyPlaceholder")}
                  rows={3}
                  className="resize-none"
                />
                <Button variant="gold" size="sm" disabled={sending || !replyText.trim()} onClick={() => void sendReply()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("tickets.sendReply")}
                </Button>
              </div>
            ) : (
              <p className="border-t border-border/60 p-3 text-xs text-muted-foreground">{t("tickets.closedHint")}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

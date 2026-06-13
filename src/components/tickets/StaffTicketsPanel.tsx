import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, Loader2, MessageSquare, Plus, Search, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
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
import { loadMessageableCustomers, type MessageableCustomerOption } from "@/lib/ticketArtists";
import TicketMessageList from "@/components/tickets/TicketMessageList";
import {
  countTicketMediaForUser,
  loadTicketMediaByMessageIds,
  signTicketMediaUrls,
  uploadTicketImage,
} from "@/lib/ticketMedia";

type TicketWithCustomer = SupportTicketRow & {
  customer_name?: string | null;
  artist_name?: string | null;
};

type Props = {
  highlightCustomerId?: string;
  highlightTicketId?: string;
};

export default function StaffTicketsPanel({ highlightCustomerId, highlightTicketId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { roles } = useUserRoles();
  const isAdmin = roles.includes("admin");
  const [tickets, setTickets] = useState<TicketWithCustomer[]>([]);
  const [customers, setCustomers] = useState<MessageableCustomerOption[]>([]);
  const [newCustomerId, setNewCustomerId] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessageRow[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<"open" | "closed" | "all">("open");
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [imagesUsed, setImagesUsed] = useState(0);
  const [uploading, setUploading] = useState(false);
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
    const userIds = [...new Set(rows.flatMap((r) => [r.customer_id, r.assigned_artist_id].filter(Boolean)))] as string[];
    const names: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);
      (profiles || []).forEach((p) => {
        if (p.user_id) names[p.user_id] = p.display_name || t("tickets.participant");
      });
    }

    setTickets(
      rows.map((row) => ({
        ...row,
        customer_name: names[row.customer_id] || null,
        artist_name: row.assigned_artist_id ? names[row.assigned_artist_id] || null : null,
      })),
    );
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

      const mediaMap = await loadTicketMediaByMessageIds(ticketId);
      setMediaUrls(await signTicketMediaUrls(mediaMap));
      if (user) {
        setImagesUsed(await countTicketMediaForUser(ticketId, user.id));
      }

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
    [profileNames, t, user],
  );

  useEffect(() => {
    if (!user) return;
    void loadMessageableCustomers(user.id, isAdmin).then(setCustomers);
  }, [user, isAdmin]);

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

  const handleUpload = async (file: File) => {
    if (!selectedId || !user) return;
    setUploading(true);
    try {
      await uploadTicketImage(selectedId, user.id, file);
      await loadMessages(selectedId);
      await loadTickets();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "limit") toast.error(t("tickets.imageLimitReached"));
      else if (code === "type") toast.error(t("tickets.invalidImageType"));
      else toast.error(t("tickets.uploadFailed"));
    } finally {
      setUploading(false);
    }
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

  const startCustomerMessage = async () => {
    if (!newCustomerId || !newBody.trim()) return;
    setCreating(true);
    const subject = newSubject.trim() || t("tickets.staffDefaultSubject");
    const { data, error } = await supabase.rpc("create_staff_ticket" as any, {
      p_customer_id: newCustomerId,
      p_subject: subject,
      p_body: newBody.trim(),
      p_category: "general",
      p_booking_id: null,
    });
    setCreating(false);
    if (error) {
      toast.error(t("tickets.createFailed"));
      return;
    }
    toast.success(t("tickets.messageStarted"));
    setShowNewMessage(false);
    setNewCustomerId("");
    setNewSubject("");
    setNewBody("");
    const ticket = data as SupportTicketRow;
    setSelectedId(ticket.id);
    void loadTickets();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-3 rounded-lg border border-border/70 bg-card/55 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{t("tickets.staffTitle")}</h2>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setShowNewMessage((v) => !v)}>
              <Plus className="h-3.5 w-3.5" />
              {t("tickets.messageCustomer")}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void loadTickets()}>
              {t("tickets.refresh")}
            </Button>
          </div>
        </div>

        {showNewMessage ? (
          <div className="rounded-md border border-border/60 bg-background/40 p-3 space-y-2">
            <p className="text-xs font-medium">{t("tickets.messageCustomerHint")}</p>
            <Select value={newCustomerId} onValueChange={setNewCustomerId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t("tickets.chooseCustomer")} />
              </SelectTrigger>
              <SelectContent>
                {customers.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    {t("tickets.noCustomers")}
                  </SelectItem>
                ) : (
                  customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Input
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder={t("tickets.subjectPlaceholder")}
              className="h-9"
            />
            <Textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder={t("tickets.messagePlaceholder")}
              rows={3}
              className="resize-none"
            />
            <div className="flex gap-2">
              <Button variant="gold" size="sm" disabled={creating || !newCustomerId || !newBody.trim()} onClick={() => void startCustomerMessage()}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("tickets.sendMessage")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowNewMessage(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : null}

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
                  {tk.artist_name ? (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {t("tickets.withArtist", { name: tk.artist_name })}
                    </p>
                  ) : null}
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
                  {activeTicket.customer_name || t("tickets.customer")}
                  {activeTicket.artist_name ? ` · ${t("tickets.withArtist", { name: activeTicket.artist_name })}` : ""}
                  {" · "}
                  {t(ticketCategoryLabelKey(activeTicket.category))}
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

            <TicketMessageList
              messages={messages}
              mediaUrls={mediaUrls}
              userId={user?.id}
              customerId={activeTicket.customer_id}
              profileNames={profileNames}
              replyText={replyText}
              onReplyChange={setReplyText}
              onSendReply={() => void sendReply()}
              onUpload={(file) => void handleUpload(file)}
              sending={sending}
              uploading={uploading}
              isOpen={activeTicket.status === "open"}
              imagesUsed={imagesUsed}
              messagesEndRef={messagesEndRef}
            />
          </>
        )}
      </div>
    </div>
  );
}

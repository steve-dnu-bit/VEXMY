import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, MessageSquarePlus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import CustomerLayout from "@/components/CustomerLayout";
import ExternalMessageActions from "@/components/messaging/ExternalMessageActions";
import { useCustomerShop } from "@/hooks/useCustomerShop";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
import {
  TICKET_CATEGORIES,
  ticketCategoryLabelKey,
  type SupportTicketMessageRow,
  type SupportTicketRow,
} from "@/lib/supportTickets";
import { loadStudioArtists, type StudioArtistOption } from "@/lib/ticketArtists";
import TicketMessageList from "@/components/tickets/TicketMessageList";
import {
  countTicketMediaForUser,
  loadTicketMediaByMessageIds,
  signTicketMediaUrls,
  uploadTicketImage,
} from "@/lib/ticketMedia";

type BookingOption = { id: string; label: string; artistId: string | null };

const CustomerTicketsPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { selectedOrgId, selectedShop } = useCustomerShop();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightTicketId = searchParams.get("ticketId");

  const [contact, setContact] = useState<{ phone: string | null; email: string | null }>({
    phone: null,
    email: null,
  });
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessageRow[]>([]);
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [artists, setArtists] = useState<StudioArtistOption[]>([]);
  const [artistId, setArtistId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [bookingId, setBookingId] = useState<string>("none");
  const [body, setBody] = useState("");
  const [replyText, setReplyText] = useState("");
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [imagesUsed, setImagesUsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [closing, setClosing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      if (!selectedOrgId) return;
      const { data: shop } = await supabase
        .from("shop_settings" as any)
        .select("support_email, phone")
        .eq("organization_id", selectedOrgId)
        .maybeSingle();
      setContact({
        phone: (shop as any)?.phone ?? selectedShop?.phone ?? null,
        email: (shop as any)?.support_email ?? null,
      });
    })();
  }, [selectedOrgId, selectedShop?.phone]);

  const loadTickets = useCallback(async () => {
    if (!selectedOrgId) {
      setTickets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("support_tickets" as any)
      .select("*")
      .eq("organization_id", selectedOrgId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(t("tickets.loadFailed"));
      setLoading(false);
      return;
    }
    setTickets((data || []) as SupportTicketRow[]);
    setLoading(false);
  }, [selectedOrgId, t]);

  const loadArtists = useCallback(async () => {
    const list = await loadStudioArtists(selectedOrgId);
    setArtists(list);
    if (list.length === 1) setArtistId(list[0].id);
  }, [selectedOrgId]);

  const loadBookings = useCallback(async () => {
    if (!selectedOrgId || !user) return;
    const { data } = await supabase
      .from("bookings")
      .select("id, client_name, starts_at, artist_id")
      .eq("organization_id", selectedOrgId)
      .or(`client_user_id.eq.${user.id},client_email.eq.${user.email}`)
      .order("starts_at", { ascending: false })
      .limit(20);

    setBookings(
      (data || []).map((b) => ({
        id: b.id,
        label: `${b.client_name} · ${format(parseISO(b.starts_at), "d MMM yyyy")}`,
        artistId: b.artist_id ?? null,
      })),
    );
  }, [selectedOrgId, user]);

  useEffect(() => {
    void loadTickets();
    void loadBookings();
    void loadArtists();
  }, [loadTickets, loadBookings, loadArtists]);

  useEffect(() => {
    if (bookingId === "none") return;
    const booking = bookings.find((b) => b.id === bookingId);
    if (booking?.artistId) setArtistId(booking.artistId);
  }, [bookingId, bookings]);

  useEffect(() => {
    if (highlightTicketId && tickets.some((tk) => tk.id === highlightTicketId)) {
      setSelectedId(highlightTicketId);
      setShowForm(false);
    }
  }, [highlightTicketId, tickets]);

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
      setMessages((data || []) as SupportTicketMessageRow[]);
      const mediaMap = await loadTicketMediaByMessageIds(ticketId);
      setMediaUrls(await signTicketMediaUrls(mediaMap));
      if (user) {
        setImagesUsed(await countTicketMediaForUser(ticketId, user.id));
      }
    },
    [t, user],
  );

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
    const channel = supabase
      .channel(`customer-ticket-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${selectedId}` },
        () => {
          void loadMessages(selectedId);
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

  const activeTicket = useMemo(() => tickets.find((tk) => tk.id === selectedId) || null, [tickets, selectedId]);

  const createTicket = async () => {
    if (!selectedOrgId || !subject.trim() || !body.trim() || !artistId) return;
    setCreating(true);
    const { data, error } = await supabase.rpc("create_support_ticket" as any, {
      p_organization_id: selectedOrgId,
      p_subject: subject.trim(),
      p_category: category,
      p_body: body.trim(),
      p_booking_id: bookingId === "none" ? null : bookingId,
      p_assigned_artist_id: artistId,
    });
    setCreating(false);
    if (error) {
      toast.error(t("tickets.createFailed"));
      return;
    }
    toast.success(t("tickets.created"));
    setShowForm(false);
    setSubject("");
    setBody("");
    setBookingId("none");
    setCategory("general");
    if (artists.length === 1) setArtistId(artists[0].id);
    else setArtistId("");
    const ticket = data as SupportTicketRow;
    setSelectedId(ticket.id);
    setSearchParams({ ticketId: ticket.id });
    void loadTickets();
  };

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

  return (
    <CustomerLayout>
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-gold">{t("tickets.customerTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("tickets.customerDesc")}</p>
        </div>

        <div className="rounded-lg border border-border/70 bg-card/55 p-4 space-y-3">
          <p className="text-sm font-medium">{t("tickets.quickContact")}</p>
          <p className="text-xs text-muted-foreground">{t("tickets.quickContactHint")}</p>
          <ExternalMessageActions phone={contact.phone} layout="column" />
          {contact.email ? (
            <p className="text-sm text-muted-foreground">
              {t("customer.emailStudio", { defaultValue: "Email" })}:{" "}
              <a href={`mailto:${contact.email}`} className="text-gold hover:underline">
                {contact.email}
              </a>
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{t("tickets.yourTickets")}</h2>
          <Button
            variant="gold"
            size="sm"
            className="gap-1"
            onClick={() => {
              setShowForm(true);
              setSelectedId(null);
              setSearchParams({});
            }}
          >
            <Plus className="h-4 w-4" />
            {t("tickets.raiseTicket")}
          </Button>
        </div>

        {showForm ? (
          <div className="rounded-lg border border-border/70 bg-card/55 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-gold" />
              <p className="font-medium">{t("tickets.newTicket")}</p>
            </div>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("tickets.subjectPlaceholder")} />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {t(ticketCategoryLabelKey(cat))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {artists.length > 0 ? (
              <Select value={artistId} onValueChange={setArtistId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("tickets.chooseArtist")} />
                </SelectTrigger>
                <SelectContent>
                  {artists.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">{t("tickets.noArtists")}</p>
            )}
            {bookings.length > 0 ? (
              <Select value={bookingId} onValueChange={setBookingId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("tickets.relatedBooking")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("tickets.noBooking")}</SelectItem>
                  {bookings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("tickets.messagePlaceholder")}
              rows={4}
              className="resize-none"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="gold"
                size="sm"
                disabled={creating || !subject.trim() || !body.trim() || !artistId}
                onClick={() => void createTicket()}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("tickets.submitTicket")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tickets.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground">{t("tickets.noTicketsYet")}</p>
        ) : (
          <div className="space-y-3">
            {!selectedId
              ? tickets.map((tk) => (
                  <button
                    key={tk.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(tk.id);
                      setSearchParams({ ticketId: tk.id });
                    }}
                    className="w-full rounded-lg border border-border/70 bg-card/55 p-3 text-left hover:bg-secondary/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{tk.subject}</p>
                      <Badge variant={tk.status === "open" ? "default" : "secondary"} className="text-[10px]">
                        {tk.status === "open" ? t("tickets.open") : t("tickets.closedLabel")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(parseISO(tk.last_message_at || tk.created_at), "d MMM · HH:mm")} ·{" "}
                      {t(ticketCategoryLabelKey(tk.category))}
                    </p>
                  </button>
                ))
              : activeTicket && (
                  <div className="rounded-lg border border-border/70 bg-card/55 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 border-b border-border/60 p-3">
                      <div>
                        <p className="font-medium">{activeTicket.subject}</p>
                        <p className="text-xs text-muted-foreground">{t(ticketCategoryLabelKey(activeTicket.category))}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setSelectedId(null);
                          setSearchParams({});
                        }}
                      >
                        {t("tickets.backToList")}
                      </Button>
                    </div>
                    <TicketMessageList
                      messages={messages}
                      mediaUrls={mediaUrls}
                      userId={user?.id}
                      customerId={activeTicket.customer_id}
                      profileNames={{}}
                      replyText={replyText}
                      onReplyChange={setReplyText}
                      onSendReply={() => void sendReply()}
                      onUpload={(file) => void handleUpload(file)}
                      onClose={() => void closeTicket()}
                      sending={sending}
                      uploading={uploading}
                      closing={closing}
                      isOpen={activeTicket.status === "open"}
                      imagesUsed={imagesUsed}
                      showClose
                      compact
                      messagesEndRef={messagesEndRef}
                    />
                  </div>
                )}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
};

export default CustomerTicketsPage;

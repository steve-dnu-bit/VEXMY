import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { X, Clock, User, Palette, MapPin, Ruler, Phone, Mail, FileText, Pencil, AlertTriangle, Send, Printer, Download, MessageSquare, CreditCard, Star, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CountInput } from "@/components/ui/count-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import {
  buildClientConductKey,
  CLIENT_CONDUCT_THRESHOLDS,
  isClientConductHighRisk,
  normalizeClientEmail,
  normalizeClientPhone,
} from "@/lib/clientConduct";
import { consentPdfBasename, downloadConsentPdf, printConsentPdf } from "@/lib/consentPdfActions";
import { BOOKING_TYPE_BADGE_STYLES } from "@/lib/bookingTypes";
import { useScheduleI18n } from "@/hooks/useScheduleI18n";
import { useSubscription } from "@/hooks/useSubscription";
import ExternalMessageActions from "@/components/messaging/ExternalMessageActions";
import ClientAppointmentsDialog from "@/components/schedule/ClientAppointmentsDialog";
import { loadPosSaleForBooking, type PosSaleRow } from "@/lib/posCheckout";
import { formatShopMoney } from "@/lib/shopCurrency";
import { getUserOrganizationId } from "@/lib/shopSettings";
import { Link } from "react-router-dom";
import { DEFAULT_DEPOSIT_AMOUNT, loadShopDefaultDepositAmount } from "@/lib/shopDepositSettings";
import { getBookingDepositStatus } from "@/lib/serviceDeposit";

interface Booking {
  id: string;
  artist_id: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  client_user_id?: string | null;
  tattoo_style: string | null;
  tattoo_size: string | null;
  tattoo_placement: string | null;
  notes: string | null;
  booking_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  deposit_paid: boolean | null;
  deposit_amount?: number | null;
  vip_client?: boolean | null;
  organization_id?: string | null;
}

interface BookingDetailPanelProps {
  booking: Booking;
  artistName: string;
  onClose: () => void;
  onEdit: () => void;
  resolveArtistName?: (artistId: string) => string;
  onSelectClientBooking?: (bookingId: string) => void;
}

type ClientConductRow = {
  id: string;
  client_key: string;
  client_user_id: string | null;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  no_shows_count: number;
  late_cancellations_count: number;
  reschedules_count: number;
  is_banned: boolean;
  ban_reason: string | null;
};

const BookingDetailPanel = ({ booking, artistName, onClose, onEdit, resolveArtistName, onSelectClientBooking }: BookingDetailPanelProps) => {
  const { t, bookingTypeLabel, tattooSizeLabel, depositStatusLabel } = useScheduleI18n();
  const { user } = useAuth();
  const { hasFeature } = useSubscription();
  const [shopDefaultDeposit, setShopDefaultDeposit] = useState(DEFAULT_DEPOSIT_AMOUNT);
  const [conduct, setConduct] = useState<ClientConductRow | null>(null);
  const [conductLoading, setConductLoading] = useState(true);
  const [savingConduct, setSavingConduct] = useState(false);
  const [noShowsCount, setNoShowsCount] = useState(0);
  const [lateCancellationsCount, setLateCancellationsCount] = useState(0);
  const [reschedulesCount, setReschedulesCount] = useState(0);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [sendingDepositReminder, setSendingDepositReminder] = useState(false);
  const [sendingReviewRequest, setSendingReviewRequest] = useState(false);
  const [consentLoading, setConsentLoading] = useState(true);
  const [consentRows, setConsentRows] = useState<Array<{ id: string; consent_pdf_url: string | null; created_at: string }>>([]);
  const [consentDownloadBusy, setConsentDownloadBusy] = useState(false);
  const [posSale, setPosSale] = useState<PosSaleRow | null>(null);
  const [posSaleLoading, setPosSaleLoading] = useState(true);
  const [clientAppointmentsOpen, setClientAppointmentsOpen] = useState(false);

  const typeColors = BOOKING_TYPE_BADGE_STYLES;

  const conductKey = useMemo(
    () =>
      buildClientConductKey({
        clientUserId: booking.client_user_id,
        clientEmail: booking.client_email,
        clientPhone: booking.client_phone,
        clientName: booking.client_name,
      }),
    [booking.client_user_id, booking.client_email, booking.client_phone, booking.client_name],
  );

  const highRisk = isClientConductHighRisk({
    no_shows_count: noShowsCount,
    late_cancellations_count: lateCancellationsCount,
    reschedules_count: reschedulesCount,
  });

  const depositStatus = useMemo(
    () => getBookingDepositStatus(booking, shopDefaultDeposit),
    [booking, shopDefaultDeposit],
  );

  useEffect(() => {
    void loadShopDefaultDepositAmount(booking.organization_id).then(setShopDefaultDeposit);
  }, [booking.organization_id]);

  useEffect(() => {
    let cancelled = false;
    const loadConduct = async () => {
      setConductLoading(true);
      const orgId = booking.organization_id ?? (await getUserOrganizationId());
      let query = supabase
        .from("client_conduct" as any)
        .select("id, organization_id, client_key, client_user_id, client_name, client_email, client_phone, no_shows_count, late_cancellations_count, reschedules_count, is_banned, ban_reason")
        .eq("client_key", conductKey);
      if (orgId) query = query.eq("organization_id", orgId);
      const { data } = await query.maybeSingle();
      if (cancelled) return;
      const row = (data as ClientConductRow | null) || null;
      setConduct(row);
      setNoShowsCount(Number(row?.no_shows_count || 0));
      setLateCancellationsCount(Number(row?.late_cancellations_count || 0));
      setReschedulesCount(Number(row?.reschedules_count || 0));
      setIsBanned(!!row?.is_banned);
      setBanReason(row?.ban_reason || "");
      setConductLoading(false);
    };
    void loadConduct();
    return () => {
      cancelled = true;
    };
  }, [conductKey, booking.organization_id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPosSaleLoading(true);
      const sale = await loadPosSaleForBooking(booking.id);
      if (!cancelled) {
        setPosSale(sale);
        setPosSaleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [booking.id]);

  useEffect(() => {
    let cancelled = false;
    const loadConsent = async () => {
      setConsentLoading(true);
      const { data } = await supabase
        .from("consent_signatures")
        .select("id, consent_pdf_url, created_at")
        .eq("booking_id", booking.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setConsentRows((data as Array<{ id: string; consent_pdf_url: string | null; created_at: string }>) || []);
      setConsentLoading(false);
    };
    void loadConsent();
    return () => {
      cancelled = true;
    };
  }, [booking.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`booking-consent-${booking.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "consent_signatures", filter: `booking_id=eq.${booking.id}` },
        async () => {
          const { data } = await supabase
            .from("consent_signatures")
            .select("id, consent_pdf_url, created_at")
            .eq("booking_id", booking.id)
            .order("created_at", { ascending: false });
          setConsentRows((data as Array<{ id: string; consent_pdf_url: string | null; created_at: string }>) || []);
          setConsentLoading(false);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [booking.id]);

  const saveConduct = async () => {
    if (!user) return;
    if (isBanned && !banReason.trim()) {
      toast.error(t("schedule.addBanReason"));
      return;
    }
    setSavingConduct(true);
    const organizationId = booking.organization_id ?? (await getUserOrganizationId(user.id));
    if (!organizationId) {
      setSavingConduct(false);
      toast.error(t("schedule.conductOrgMissing"));
      return;
    }
    const payload = {
      organization_id: organizationId,
      client_key: conductKey,
      client_user_id: booking.client_user_id || null,
      client_name: booking.client_name,
      client_email: normalizeClientEmail(booking.client_email),
      client_phone: normalizeClientPhone(booking.client_phone),
      no_shows_count: Math.max(0, Number(noShowsCount || 0)),
      late_cancellations_count: Math.max(0, Number(lateCancellationsCount || 0)),
      reschedules_count: Math.max(0, Number(reschedulesCount || 0)),
      is_banned: isBanned,
      ban_reason: isBanned ? banReason.trim() : null,
      updated_by: user.id,
    };
    const selectCols =
      "id, organization_id, client_key, client_user_id, client_name, client_email, client_phone, no_shows_count, late_cancellations_count, reschedules_count, is_banned, ban_reason";
    const { data, error } = conduct?.id
      ? await supabase
          .from("client_conduct" as any)
          .update(payload)
          .eq("id", conduct.id)
          .select(selectCols)
          .single()
      : await supabase.from("client_conduct" as any).insert(payload).select(selectCols).single();
    setSavingConduct(false);
    if (error) {
      toast.error(error.message || t("schedule.conductSaveFailed"));
      return;
    }
    setConduct(data as ClientConductRow);
    toast.success(t("schedule.conductUpdated"));
  };

  const sendDepositReminder = async () => {
    if (depositStatus !== "pending") {
      toast.info(
        depositStatus === "paid" ? t("schedule.depositAlreadyPaid") : t("schedule.noDepositForService"),
      );
      return;
    }
    if (!booking.client_email) {
      toast.error(t("schedule.noClientEmailDeposit"));
      return;
    }

    setSendingDepositReminder(true);
    const { data, error } = await invokeEdgeFunctionJson<{
      checkoutUrl?: string;
      emailAttempted?: boolean;
      emailSent?: boolean;
      emailError?: string | null;
      error?: string;
    }>("create-stripe-checkout", {
      type: "deposit",
      bookingId: booking.id,
      sendEmail: true,
    });
    setSendingDepositReminder(false);

    if (error || !data?.checkoutUrl) {
      toast.error(data?.error || error?.message || t("schedule.depositLinkFailed"));
      return;
    }

    const emailAttempted = !!data.emailAttempted;
    const emailSent = !!data.emailSent;
    const emailFailureMessage =
      data.emailError || "Unknown email delivery error. Please check SMTP credentials/provider logs.";

    try {
      await navigator.clipboard.writeText(data.checkoutUrl);
      if (emailSent) {
        toast.success(t("schedule.depositReminderSentCopied"));
      } else {
        toast.error(
          emailAttempted
            ? t("schedule.depositLinkCopiedEmailFailed", {
                defaultValue: "Deposit link created and copied, but email was not sent: {{msg}}",
                msg: emailFailureMessage,
              })
            : t("schedule.depositLinkCopiedEmailNotAttempted", {
                defaultValue: "Deposit link created and copied, but email send was not attempted.",
              }),
        );
      }
    } catch {
      if (emailSent) {
        toast.success(t("schedule.depositReminderSent"));
      } else {
        toast.error(
          emailAttempted
            ? t("schedule.depositLinkCreatedEmailFailed", {
                defaultValue: "Deposit link created, but email was not sent: {{msg}}",
                msg: emailFailureMessage,
              })
            : t("schedule.depositLinkCreatedEmailNotAttempted", {
                defaultValue: "Deposit link created, but email send was not attempted.",
              }),
        );
      }
      toast.message(data.checkoutUrl);
    }
  };

  const sendReviewRequest = async () => {
    if (!booking.client_email) {
      toast.error(t("schedule.noClientEmailReview"));
      return;
    }
    setSendingReviewRequest(true);
    const { data, error } = await invokeEdgeFunctionJson<{
      ok?: boolean;
      error?: string;
      message?: string;
    }>("send-review-request", { bookingId: booking.id });
    setSendingReviewRequest(false);

    if (error || !data?.ok) {
      const msg = data?.message || data?.error || error?.message || t("schedule.reviewRequestFailed");
      if (data?.error === "no_review_links") {
        toast.error(t("schedule.reviewLinksNotConfigured"));
      } else {
        toast.error(msg);
      }
      return;
    }
    toast.success(t("schedule.reviewRequestSent"));
  };

  return (
    <>
      {/* Mobile overlay */}
      <div className="fixed inset-0 bg-background/60 z-30 md:hidden" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-40 w-[85vw] max-w-xs md:relative md:w-72 md:z-auto border-l border-border bg-card flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="font-display text-sm font-semibold">{t("schedule.bookingDetails")}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-3 pt-2">
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            {t("schedule.editBookingBtn")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
          <div>
            <p className="text-base font-display font-bold">{booking.client_name}</p>
            <Badge variant="outline" className={`mt-1 text-[10px] ${typeColors[booking.booking_type] || ""}`}>
              {bookingTypeLabel(booking.booking_type)}
            </Badge>
            {(isBanned || highRisk) && (
              <div className="mt-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                <Badge className={isBanned ? "bg-destructive/20 text-destructive border-destructive/30 text-[10px]" : "bg-amber-500/15 text-amber-200 border-amber-500/25 text-[10px]"}>
                  {isBanned ? t("schedule.banned") : t("schedule.highRisk")}
                </Badge>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full mt-2 h-8 text-xs gap-1.5"
              onClick={() => setClientAppointmentsOpen(true)}
            >
              <CalendarDays className="h-3.5 w-3.5 text-gold" />
              {t("schedule.clientAppointments")}
            </Button>
          </div>

          <div className="flex items-start gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-xs">{format(parseISO(booking.starts_at), "EEE, d MMM")}</p>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(booking.starts_at), "h:mm a")} – {format(parseISO(booking.ends_at), "h:mm a")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs">{artistName}</p>
          </div>

          {(booking.client_phone || booking.client_email) && (
            <div className="space-y-1.5 pt-2 border-t border-border">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("schedule.contact")}</p>
              {booking.client_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs">{booking.client_phone}</p>
                </div>
              )}
              {booking.client_email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs">{booking.client_email}</p>
                </div>
              )}
              <ExternalMessageActions
                phone={booking.client_phone}
                email={booking.client_email}
                whatsAppMessage={t("schedule.whatsAppPrefill", {
                  name: booking.client_name,
                  date: format(parseISO(booking.starts_at), "EEE d MMM"),
                  time: format(parseISO(booking.starts_at), "h:mm a"),
                })}
                emailSubject={t("unifiedInbox.templateBookingSubject", { name: booking.client_name })}
                emailBody={t("schedule.whatsAppPrefill", {
                  name: booking.client_name,
                  date: format(parseISO(booking.starts_at), "EEE d MMM"),
                  time: format(parseISO(booking.starts_at), "h:mm a"),
                })}
                layout="column"
                className="pt-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs gap-1.5"
                disabled={!booking.client_email || sendingReviewRequest}
                onClick={() => void sendReviewRequest()}
              >
                {sendingReviewRequest ? (
                  <Send className="h-3 w-3 animate-pulse" />
                ) : (
                  <Star className="h-3 w-3 text-gold" />
                )}
                {sendingReviewRequest ? t("schedule.sending") : t("schedule.requestReview")}
              </Button>
              {booking.client_user_id && hasFeature("staff_inbox") ? (
                <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1" asChild>
                  <Link to={`/inbox?customerId=${encodeURIComponent(booking.client_user_id)}`}>
                    <MessageSquare className="h-3 w-3" />
                    {t("tickets.viewTickets")}
                  </Link>
                </Button>
              ) : null}
            </div>
          )}

          {(booking.tattoo_style || booking.tattoo_size || booking.tattoo_placement) && (
            <div className="space-y-1.5 pt-2 border-t border-border">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("schedule.tattoo")}</p>
              {booking.tattoo_style && (
                <div className="flex items-center gap-2"><Palette className="h-3.5 w-3.5 text-muted-foreground" /><p className="text-xs">{booking.tattoo_style}</p></div>
              )}
              {booking.tattoo_size && (
                <div className="flex items-center gap-2"><Ruler className="h-3.5 w-3.5 text-muted-foreground" /><p className="text-xs">{tattooSizeLabel(booking.tattoo_size)}</p></div>
              )}
              {booking.tattoo_placement && (
                <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /><p className="text-xs">{booking.tattoo_placement}</p></div>
              )}
            </div>
          )}

          {booking.notes && (
            <div className="space-y-1.5 pt-2 border-t border-border">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("schedule.notes")}</p>
              <div className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground">{booking.notes}</p>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("schedule.deposit")}</p>
            <Badge
              variant={depositStatus === "paid" ? "default" : "outline"}
              className="text-[10px]"
            >
              {depositStatusLabel(booking, shopDefaultDeposit)}
            </Badge>
            {depositStatus === "pending" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 mt-2 text-xs gap-1"
                  onClick={sendDepositReminder}
                  disabled={sendingDepositReminder}
                >
                  <Send className="h-3 w-3" />
                  {sendingDepositReminder ? t("schedule.sending") : t("schedule.sendReminder")}
                </Button>
                <Button size="sm" variant="secondary" className="w-full h-8 mt-2 text-xs gap-1" asChild>
                  <Link
                    to={`/checkout?bookingId=${encodeURIComponent(booking.id)}&artistId=${encodeURIComponent(booking.artist_id)}&clientName=${encodeURIComponent(booking.client_name)}`}
                  >
                    <CreditCard className="h-3 w-3" />
                    {t("schedule.payAtDesk")}
                  </Link>
                </Button>
              </>
            ) : null}
            {posSaleLoading ? (
              <p className="text-xs text-muted-foreground mt-2">{t("schedule.checkingPosPayment")}</p>
            ) : posSale ? (
              <Badge variant="default" className="mt-2 text-[10px]">
                {t("schedule.posPaidAtDesk", { amount: formatShopMoney(posSale.total, posSale.currency) })}
              </Badge>
            ) : null}
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("schedule.consent")}</p>
            {consentLoading ? (
              <p className="text-xs text-muted-foreground">{t("schedule.checkingConsent")}</p>
            ) : consentRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("schedule.noConsent")}</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  {t("schedule.signedAt", { date: format(parseISO(consentRows[0].created_at), "d MMM yyyy, HH:mm") })}
                </p>
                {consentRows[0].consent_pdf_url ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      onClick={() => printConsentPdf(consentRows[0].consent_pdf_url!)}
                    >
                      <Printer className="h-3 w-3 shrink-0" />
                      {t("schedule.printConsent")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      disabled={consentDownloadBusy}
                      onClick={async () => {
                        const url = consentRows[0].consent_pdf_url!;
                        setConsentDownloadBusy(true);
                        try {
                          const base = consentPdfBasename(booking.client_name, consentRows[0].created_at);
                          const ok = await downloadConsentPdf(url, base);
                          if (!ok) {
                            toast.info(t("schedule.consentOpenTab"));
                          }
                        } finally {
                          setConsentDownloadBusy(false);
                        }
                      }}
                    >
                      <Download className="h-3 w-3 shrink-0" />
                      {consentDownloadBusy ? t("schedule.downloading") : t("schedule.downloadConsent")}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("schedule.consentPdfUnavailable")}</p>
                )}
              </>
            )}
          </div>

          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("schedule.clientConduct")}</p>
            {conductLoading ? (
              <p className="text-xs text-muted-foreground">{t("schedule.loadingConduct")}</p>
            ) : (
              <>
                <div>
                  <Label className="text-[10px] text-muted-foreground">
                    {t("schedule.noShows", { count: noShowsCount, max: CLIENT_CONDUCT_THRESHOLDS.noShows })}
                  </Label>
                  <CountInput value={noShowsCount} onChange={setNoShowsCount} className="h-8 mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">
                    {t("schedule.lateCancellations", {
                      count: lateCancellationsCount,
                      max: CLIENT_CONDUCT_THRESHOLDS.lateCancellations,
                    })}
                  </Label>
                  <CountInput value={lateCancellationsCount} onChange={setLateCancellationsCount} className="h-8 mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">
                    {t("schedule.reschedules", { count: reschedulesCount, max: CLIENT_CONDUCT_THRESHOLDS.reschedules })}
                  </Label>
                  <CountInput value={reschedulesCount} onChange={setReschedulesCount} className="h-8 mt-1 text-xs" />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-2">
                  <Label htmlFor={`ban-${booking.id}`} className="text-xs">{t("schedule.banned")}</Label>
                  <Switch id={`ban-${booking.id}`} checked={isBanned} onCheckedChange={setIsBanned} />
                </div>
                {isBanned ? (
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{t("schedule.banReason")}</Label>
                    <Input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder={t("schedule.banReasonPlaceholder")} className="h-8 mt-1 text-xs" />
                  </div>
                ) : null}
                {conduct?.updated_by ? (
                  <p className="text-[10px] text-muted-foreground">{t("schedule.conductSavedByStaff")}</p>
                ) : null}
                <Button size="sm" className="w-full h-8 text-xs" onClick={saveConduct} disabled={savingConduct}>
                  {savingConduct ? t("schedule.saving") : t("schedule.saveConduct")}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <ClientAppointmentsDialog
        open={clientAppointmentsOpen}
        onOpenChange={setClientAppointmentsOpen}
        clientName={booking.client_name}
        clientUserId={booking.client_user_id}
        clientEmail={booking.client_email}
        clientPhone={booking.client_phone}
        currentBookingId={booking.id}
        resolveArtistName={resolveArtistName ?? (() => artistName)}
        onSelectBooking={onSelectClientBooking}
      />
    </>
  );
};

export default BookingDetailPanel;

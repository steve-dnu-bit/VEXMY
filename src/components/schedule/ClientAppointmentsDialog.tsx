import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BOOKING_TYPE_BADGE_STYLES } from "@/lib/bookingTypes";
import { fetchClientAppointments, type ClientAppointmentRow } from "@/lib/clientAppointments";
import { useScheduleI18n } from "@/hooks/useScheduleI18n";

type ClientAppointmentsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  clientUserId?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  currentBookingId: string;
  resolveArtistName: (artistId: string) => string;
  onSelectBooking?: (bookingId: string) => void;
};

const ClientAppointmentsDialog = ({
  open,
  onOpenChange,
  clientName,
  clientUserId,
  clientEmail,
  clientPhone,
  currentBookingId,
  resolveArtistName,
  onSelectBooking,
}: ClientAppointmentsDialogProps) => {
  const { t, bookingTypeLabel, statusLabel } = useScheduleI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ClientAppointmentRow[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      const { rows: loaded, error: loadError } = await fetchClientAppointments({
        clientUserId,
        clientEmail,
        clientPhone,
        clientName,
      });
      if (cancelled) return;
      setRows(loaded);
      setError(loadError);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, clientUserId, clientEmail, clientPhone, clientName]);

  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    const upcomingRows: ClientAppointmentRow[] = [];
    const pastRows: ClientAppointmentRow[] = [];

    for (const row of rows) {
      const end = parseISO(row.ends_at);
      if (end < now) pastRows.push(row);
      else upcomingRows.push(row);
    }

    upcomingRows.sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime());
    pastRows.sort((a, b) => parseISO(b.starts_at).getTime() - parseISO(a.starts_at).getTime());

    return { upcoming: upcomingRows, past: pastRows };
  }, [rows]);

  const renderRow = (row: ClientAppointmentRow) => {
    const isCurrent = row.id === currentBookingId;
    const typeClass = BOOKING_TYPE_BADGE_STYLES[row.booking_type] || "";

    return (
      <button
        key={row.id}
        type="button"
        disabled={!onSelectBooking}
        onClick={() => {
          if (!onSelectBooking) return;
          onSelectBooking(row.id);
          onOpenChange(false);
        }}
        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
          isCurrent
            ? "border-gold/40 bg-gold/10"
            : "border-border hover:border-gold/30 hover:bg-muted/40"
        } ${onSelectBooking ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium">
              {format(parseISO(row.starts_at), "EEE, d MMM yyyy")}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {format(parseISO(row.starts_at), "h:mm a")} – {format(parseISO(row.ends_at), "h:mm a")}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {resolveArtistName(row.artist_id)}
              {row.tattoo_style ? ` · ${row.tattoo_style}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {isCurrent ? (
              <Badge variant="outline" className="text-[9px] border-gold/40 text-gold">
                {t("schedule.clientAppointmentsCurrent")}
              </Badge>
            ) : null}
            <Badge variant="outline" className={`text-[9px] ${typeClass}`}>
              {bookingTypeLabel(row.booking_type)}
            </Badge>
            <span className="text-[10px] text-muted-foreground capitalize">
              {statusLabel(row.status)}
            </span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-display">
            <CalendarDays className="h-4 w-4 text-gold" />
            {t("schedule.clientAppointmentsTitle")}
          </DialogTitle>
          <DialogDescription className="text-left">{clientName}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-4">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t("schedule.clientAppointmentsEmpty")}</p>
          ) : (
            <>
              {upcoming.length > 0 ? (
                <section className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("schedule.clientAppointmentsUpcoming", { count: upcoming.length })}
                  </p>
                  <div className="space-y-2">{upcoming.map(renderRow)}</div>
                </section>
              ) : null}

              {past.length > 0 ? (
                <section className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("schedule.clientAppointmentsPast", { count: past.length })}
                  </p>
                  <div className="space-y-2">{past.map(renderRow)}</div>
                </section>
              ) : null}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0">
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClientAppointmentsDialog;

import { useMemo, type CSSProperties } from "react";
import { format, parseISO, isSameDay } from "date-fns";
import { Plus } from "lucide-react";
import type { Service } from "@/components/schedule/ServicePresets";
import { getBookingServiceName } from "@/lib/bookingService";
import { layoutStackedBookingBlocks } from "@/lib/scheduleBookingLayout";
import { BOOKING_TYPE_STYLES } from "@/lib/bookingTypes";
import { getArtistBookingBlockStyle } from "@/lib/themePresets";
import type { ArtistColorMap } from "@/lib/artistThemeCache";

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
  service_category?: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  deposit_paid: boolean | null;
}

interface Profile {
  user_id: string;
  display_name: string | null;
  portal_bg_color?: string | null;
}

interface TimeGridProps {
  days: Date[];
  bookings: Booking[];
  profiles: Profile[];
  profilesReady?: boolean;
  artistColorCache?: ArtistColorMap;
  services: Service[];
  selectedArtists: string[];
  onBookingClick: (booking: Booking) => void;
  onSlotClick: (date: Date, hour: number, minute?: number) => void;
  view: "day" | "week";
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8);
const ROW_H = 56;
const GRID_BODY_H = HOURS.length * ROW_H;
const FIRST_HOUR = HOURS[0];

const bookingTypeStyles = BOOKING_TYPE_STYLES;

type ColumnDef = { user_id: string; display_name: string; day: Date };

function bookingBlockAppearance(
  booking: Booking,
  portalBgColor: string | null | undefined,
  profilesReady: boolean,
): { className: string; style: CSSProperties } {
  const artistTheme = getArtistBookingBlockStyle(portalBgColor, {
    cancelled: booking.status === "cancelled",
  });
  if (artistTheme) {
    return {
      className: "border",
      style: artistTheme,
    };
  }
  if (!profilesReady) {
    return { className: "border border-border/50 bg-muted/25", style: {} };
  }
  const colorClass = bookingTypeStyles[booking.booking_type] || bookingTypeStyles.session;
  return { className: colorClass, style: {} };
}

function BookingBlock({
  booking,
  layout,
  serviceName,
  artistName,
  showArtistOnBlock,
  portalBgColor,
  profilesReady,
  onBookingClick,
}: {
  booking: Booking;
  layout: { top: number; height: number };
  serviceName: string;
  artistName: string;
  showArtistOnBlock: boolean;
  portalBgColor?: string | null;
  profilesReady: boolean;
  onBookingClick: (booking: Booking) => void;
}) {
  const { className: colorClass, style: themeStyle } = bookingBlockAppearance(booking, portalBgColor, profilesReady);
  const heightPx = layout.height;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onBookingClick(booking);
      }}
      className={`absolute left-0.5 right-0.5 rounded-lg px-1.5 py-0.5 border cursor-pointer transition-all hover:shadow-elevated text-[10px] overflow-hidden leading-tight ${colorClass}`}
      style={{
        top: `${layout.top}px`,
        height: `${layout.height}px`,
        zIndex: 5,
        ...themeStyle,
      }}
    >
      <p className="font-semibold truncate text-[11px]">{booking.client_name}</p>
      {heightPx > 28 && serviceName ? <p className="text-[9px] opacity-90 truncate">{serviceName}</p> : null}
      {heightPx > 40 ? (
        <p className="text-[9px] text-muted-foreground truncate mt-0.5">
          {format(parseISO(booking.starts_at), "h:mm a").toLowerCase()}
          {showArtistOnBlock ? ` · ${artistName}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function ArtistColumnHeader({
  col,
  safeName,
  portalBgColor,
  onQuickAdd,
}: {
  col: ColumnDef;
  safeName: (name?: string | null) => string;
  portalBgColor?: string | null;
  onQuickAdd: () => void;
}) {
  const avatarTheme = getArtistBookingBlockStyle(portalBgColor);
  return (
    <div className="relative group/col">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mx-auto mb-1 ${
          avatarTheme ? "border" : "bg-primary/20 text-primary"
        }`}
        style={
          avatarTheme
            ? {
                backgroundColor: avatarTheme.backgroundColor,
                borderColor: avatarTheme.borderColor,
                color: avatarTheme.color,
              }
            : undefined
        }
      >
        {safeName(col.display_name).charAt(0).toUpperCase()}
      </div>
      <p className="text-[10px] font-medium truncate text-muted-foreground px-0.5">{safeName(col.display_name)}</p>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onQuickAdd(); }}
        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover/col:opacity-100 transition-opacity shadow-sm hover:scale-110"
        title="New booking"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

const CurrentTimeIndicator = ({ hours, rowH }: { hours: number[]; rowH: number }) => {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  if (h < hours[0] || h > hours[hours.length - 1]) return null;

  const headerH = 56;
  const top = headerH + (h - hours[0]) * rowH + (m / 60) * rowH;

  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center" style={{ top: `${top}px` }}>
      <div className="w-[52px] flex justify-end pr-1 shrink-0">
        <span className="bg-accent text-accent-foreground text-[9px] font-bold px-1.5 py-0.5 rounded">
          {format(now, "h:mm")}
        </span>
      </div>
      <div className="flex-1 h-px bg-accent" />
    </div>
  );
};

const TimeGrid = ({
  days,
  bookings,
  profiles,
  profilesReady = true,
  artistColorCache = {},
  services,
  selectedArtists,
  onBookingClick,
  onSlotClick,
  view,
}: TimeGridProps) => {
  const safeName = (name?: string | null) => (name && name.trim().length > 0 ? name : "Unknown");
  const profileById = new Map(profiles.map((p) => [p.user_id, p]));
  const artistPortalColor = (artistId: string) =>
    profileById.get(artistId)?.portal_bg_color ?? artistColorCache[artistId] ?? null;
  const bookingArtistIds = [...new Set(bookings.map((b) => b.artist_id))];
  const allKnownArtistIds = [...new Set([...profiles.map((p) => p.user_id), ...bookingArtistIds])];
  const filteredBookings =
    selectedArtists.length === 0 ? bookings : bookings.filter((b) => selectedArtists.includes(b.artist_id));

  const showArtistColumns = view === "day" && profiles.length > 0;
  const visibleArtistIds = selectedArtists.length === 0 ? allKnownArtistIds : selectedArtists;
  const visibleProfiles = visibleArtistIds.map((artistId) => ({
    user_id: artistId,
    display_name: profileById.get(artistId)?.display_name ?? "Unknown artist",
  }));
  const columns: ColumnDef[] =
    view === "week"
      ? days.map((d) => ({ user_id: "day", display_name: "", day: d }))
      : showArtistColumns
        ? visibleProfiles.map((c) => ({ ...c, day: days[0] }))
        : [{ user_id: "all", display_name: "", day: days[0] }];
  const gridCols = columns.length;
  const mobileDays = view === "week" ? days : [days[0]];
  const now = new Date();
  const showArtistOnBlock = view === "week" || !showArtistColumns;

  const quickAddTime = (col: ColumnDef): { hour: number; minute: number } => {
    const colBookings = filteredBookings.filter((b) => {
      const d = parseISO(b.starts_at);
      if (!isSameDay(d, col.day)) return false;
      if (showArtistColumns && view === "day" && col.user_id !== "all") return b.artist_id === col.user_id;
      return true;
    });
    if (colBookings.length === 0) return { hour: 10, minute: 30 };
    const lastEnd = colBookings.reduce((latest, b) => {
      const t = parseISO(b.ends_at).getTime();
      return t > latest ? t : latest;
    }, 0);
    const next = new Date(lastEnd);
    return { hour: next.getHours(), minute: next.getMinutes() };
  };

  const serviceNameByBookingId = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of filteredBookings) {
      map.set(b.id, getBookingServiceName(services, b));
    }
    return map;
  }, [filteredBookings, services]);

  const layoutByColumnKey = useMemo(() => {
    const map = new Map<string, Map<string, { top: number; height: number }>>();
    for (const col of columns) {
      const colBookings = filteredBookings.filter((b) => {
        const bDate = parseISO(b.starts_at);
        if (!isSameDay(bDate, col.day)) return false;
        if (showArtistColumns && view === "day") return b.artist_id === col.user_id;
        return true;
      });
      const key = `${col.user_id}-${col.day.toISOString()}`;
      map.set(key, layoutStackedBookingBlocks(colBookings, ROW_H, FIRST_HOUR));
    }
    return map;
  }, [columns, filteredBookings, showArtistColumns, view]);

  const dayBookings = (day: Date) =>
    filteredBookings
      .filter((b) => isSameDay(parseISO(b.starts_at), day))
      .sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime());

  const mobileCardStyle = (booking: Booking): CSSProperties => {
    const theme = getArtistBookingBlockStyle(artistPortalColor(booking.artist_id), {
      cancelled: booking.status === "cancelled",
    });
    if (theme) {
      return {
        backgroundColor: theme.backgroundColor,
        borderLeftColor: theme.borderColor,
        borderLeftWidth: "4px",
      };
    }
    return {};
  };

  const mobileCardClass = (booking: Booking) => {
    if (artistPortalColor(booking.artist_id)) return "border-l-4";
    if (!profilesReady) return "border-l-4 border-l-border/50 bg-muted/25";
    if (booking.booking_type === "consultation") return "border-l-blue-400 bg-blue-500/10";
    if (booking.booking_type === "touch-up") return "border-l-emerald-400 bg-emerald-500/10";
    if (booking.booking_type === "piercing-session") return "border-l-pink-400 bg-pink-500/10";
    if (booking.booking_type === "laser-session") return "border-l-violet-400 bg-violet-500/10";
    if (booking.status === "cancelled") return "border-l-rose-400 bg-rose-500/10";
    return "border-l-primary bg-primary/10";
  };

  return (
    <div className="flex-1 overflow-auto bg-background/20 backdrop-blur-[1px] touch-pan-y">
      <div className="md:hidden p-3 space-y-3">
        {mobileDays.map((day) => {
          const items = dayBookings(day);
          const isToday = isSameDay(day, now);

          return (
            <section key={day.toISOString()} className="rounded-xl border border-border bg-card/70 overflow-hidden">
              <div className={`px-3 py-2 border-b border-border flex items-center justify-between ${isToday ? "bg-primary/10" : "bg-secondary/30"}`}>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">{format(day, "EEEE")}</p>
                  <p className={`text-base font-semibold ${isToday ? "text-primary" : ""}`}>{format(day, "d MMM yyyy")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const dayCol: ColumnDef = { user_id: "all", display_name: "", day };
                    const { hour: qh, minute: qm } = quickAddTime(dayCol);
                    onSlotClick(day, qh, qm);
                  }}
                  className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center hover:bg-primary/25 transition-colors shrink-0"
                  title="New booking"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="p-2 space-y-2">
                {items.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => onSlotClick(day, 10, 30)}
                    className="w-full text-left rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground hover:bg-secondary/30 transition-colors"
                  >
                    No appointments. Tap to add one.
                  </button>
                ) : (
                  items.map((b) => {
                    const start = parseISO(b.starts_at);
                    const end = parseISO(b.ends_at);
                    const artistName = safeName(profileById.get(b.artist_id)?.display_name);
                    const serviceName = serviceNameByBookingId.get(b.id) ?? "";
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onBookingClick(b)}
                        className={`w-full text-left rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-secondary/40 ${mobileCardClass(
                          b,
                        )}`}
                        style={mobileCardStyle(b)}
                      >
                        <p className="font-semibold text-sm truncate">{b.client_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{serviceName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(start, "h:mm a")} - {format(end, "h:mm a")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {artistName}
                          {b.deposit_paid ? " · Deposit paid" : ""}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="hidden md:block min-w-[min(100%,320px)] relative pb-8">
        <div
          className="grid sticky top-0 z-10 bg-card/80 backdrop-blur-md border-b border-border"
          style={{ gridTemplateColumns: `52px repeat(${gridCols}, minmax(72px, 1fr))` }}
        >
          <div className="p-2 text-[10px] font-medium text-muted-foreground text-center uppercase tracking-wider">Time</div>
          {view === "week"
            ? days.map((day) => {
                const isToday = isSameDay(day, new Date());
                const dayCol: ColumnDef = { user_id: "day", display_name: "", day };
                const { hour: qh, minute: qm } = quickAddTime(dayCol);
                return (
                  <div
                    key={day.toISOString()}
                    className={`py-2 px-1 text-center border-l border-border relative group/col ${isToday ? "bg-primary/5" : ""}`}
                  >
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{format(day, "EEE")}</p>
                    <p className={`text-base font-display font-bold mt-0.5 leading-tight ${isToday ? "text-primary" : ""}`}>
                      {format(day, "d")}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSlotClick(day, qh, qm); }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover/col:opacity-100 transition-opacity shadow-sm hover:scale-110"
                      title="New booking"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                );
              })
            : columns.map((col) => {
                const { hour: qh, minute: qm } = quickAddTime(col);
                return (
                  <div key={col.user_id} className="py-2 px-1 text-center border-l border-border">
                    <ArtistColumnHeader
                      col={col}
                      safeName={safeName}
                      portalBgColor={artistPortalColor(col.user_id)}
                      onQuickAdd={() => onSlotClick(col.day, qh, qm)}
                    />
                  </div>
                );
              })}
        </div>

        <div className="relative" style={{ height: `${GRID_BODY_H}px` }}>
          {HOURS.map((hour, hourIdx) => (
            <div
              key={hour}
              className={`grid absolute left-0 right-0 border-b border-border ${hourIdx % 2 === 0 ? "bg-card/35" : "bg-background/25"}`}
              style={{
                gridTemplateColumns: `52px repeat(${gridCols}, minmax(72px, 1fr))`,
                height: `${ROW_H}px`,
                top: `${hourIdx * ROW_H}px`,
              }}
            >
              <div className="flex items-start justify-end pr-2 pt-1 text-[11px] text-muted-foreground tabular-nums border-r border-border">
                {format(new Date(2000, 0, 1, hour), "h a").toLowerCase()}
              </div>
              {columns.map((col, colIdx) => (
                <div
                  key={`slot-${col.user_id}-${hour}-${colIdx}`}
                  className="border-l border-border cursor-pointer hover:bg-secondary/20 transition-colors group/slot relative"
                  onClick={() => onSlotClick(col.day, hour)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSlotClick(col.day, hour);
                    }
                  }}
                >
                  <Plus className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 opacity-0 group-hover/slot:opacity-100 transition-opacity pointer-events-none" />
                </div>
              ))}
            </div>
          ))}

          <div
            className="absolute inset-0 grid pointer-events-none z-[4]"
            style={{ gridTemplateColumns: `52px repeat(${gridCols}, minmax(72px, 1fr))` }}
          >
            <div />
            {columns.map((col, colIdx) => {
              const colKey = `${col.user_id}-${col.day.toISOString()}`;
              const layouts = layoutByColumnKey.get(colKey) ?? new Map();
              const colBookings = filteredBookings.filter((b) => layouts.has(b.id));

              return (
                <div key={`blocks-${col.user_id}-${colIdx}`} className="relative border-l border-border">
                  <div className="absolute inset-0 pointer-events-auto">
                    {colBookings.map((b) => {
                      const layout = layouts.get(b.id);
                      if (!layout) return null;
                      return (
                        <BookingBlock
                          key={b.id}
                          booking={b}
                          layout={layout}
                          serviceName={serviceNameByBookingId.get(b.id) ?? ""}
                          artistName={safeName(profileById.get(b.artist_id)?.display_name)}
                          showArtistOnBlock={showArtistOnBlock}
                          portalBgColor={artistPortalColor(b.artist_id)}
                          profilesReady={profilesReady}
                          onBookingClick={onBookingClick}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <CurrentTimeIndicator hours={HOURS} rowH={ROW_H} />
      </div>
    </div>
  );
};

export default TimeGrid;

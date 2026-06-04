import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChevronLeft, ChevronRight, PanelLeftOpen, PanelLeftClose, Users, Loader2, User } from "lucide-react";
import { format, addDays, addWeeks, subWeeks, startOfWeek } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useScheduleI18n } from "@/hooks/useScheduleI18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";

/** Escape user text for PostgREST ilike patterns */
function escapeIlike(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim().toLowerCase());

interface InviteSearchRow {
  name: string;
  email: string;
}

interface Profile {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
}

interface ScheduleHeaderProps {
  view: "day" | "week";
  setView: (v: "day" | "week") => void;
  currentDate: Date;
  setCurrentDate: (d: Date) => void;
  onNewBooking: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  profiles: Profile[];
  selectedArtists: string[];
  setSelectedArtists: (a: string[]) => void;
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviting: boolean;
  onInviteClient: () => void;
}

const ScheduleHeader = ({
  view,
  setView,
  currentDate,
  setCurrentDate,
  onNewBooking,
  sidebarOpen,
  setSidebarOpen,
  profiles,
  selectedArtists,
  setSelectedArtists,
  inviteEmail,
  setInviteEmail,
  inviting,
  onInviteClient,
}: ScheduleHeaderProps) => {
  const { t } = useScheduleI18n();
  const [inviteSearchResults, setInviteSearchResults] = useState<InviteSearchRow[]>([]);
  const [inviteSearchLoading, setInviteSearchLoading] = useState(false);
  const [inviteMenuOpen, setInviteMenuOpen] = useState(false);
  const inviteDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inviteWrapRef = useRef<HTMLDivElement>(null);

  const safeName = (name?: string | null) => (name && name.trim().length > 0 ? name : t("schedule.unknown"));
  const allSelected = selectedArtists.length === 0;
  const singleArtistId = selectedArtists.length === 1 ? selectedArtists[0] : null;

  const searchInviteClients = useCallback(async (q: string) => {
    const t = q.trim();
    if (t.length < 2) {
      setInviteSearchResults([]);
      setInviteSearchLoading(false);
      return;
    }
    setInviteSearchLoading(true);
    try {
      const pattern = `%${escapeIlike(t)}%`;
      const [cRes, bName, bEmail] = await Promise.all([
        supabase
          .from("contacts_import" as any)
          .select("name, email, phone")
          .or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
          .limit(25),
        supabase
          .from("bookings")
          .select("client_name, client_email")
          .ilike("client_name", pattern)
          .order("starts_at", { ascending: false })
          .limit(20),
        supabase
          .from("bookings")
          .select("client_name, client_email")
          .ilike("client_email", pattern)
          .order("starts_at", { ascending: false })
          .limit(20),
      ]);

      const map = new Map<string, InviteSearchRow>();
      for (const r of (cRes.data as Array<{ name?: string | null; email?: string | null }> | null) ?? []) {
        const name = (r.name || "").trim() || t("schedule.customer");
        const em = (r.email || "").trim().toLowerCase();
        if (isValidEmail(em) && !map.has(em)) map.set(em, { name, email: em });
      }
      for (const b of [...(bName.data ?? []), ...(bEmail.data ?? [])] as Array<{
        client_name: string;
        client_email: string | null;
      }>) {
        const em = (b.client_email || "").trim().toLowerCase();
        if (!isValidEmail(em)) continue;
        if (!map.has(em)) {
          map.set(em, { name: (b.client_name || "").trim() || t("schedule.customer"), email: em });
        }
      }

      setInviteSearchResults([...map.values()].slice(0, 20));
    } catch {
      setInviteSearchResults([]);
    } finally {
      setInviteSearchLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const q = inviteEmail;
    if (inviteDebounce.current) clearTimeout(inviteDebounce.current);
    if (q.trim().length < 2) {
      setInviteSearchResults([]);
      setInviteSearchLoading(false);
      setInviteMenuOpen(false);
      return;
    }
    setInviteSearchLoading(true);
    inviteDebounce.current = setTimeout(() => {
      void searchInviteClients(q);
    }, 280);
    return () => {
      if (inviteDebounce.current) clearTimeout(inviteDebounce.current);
    };
  }, [inviteEmail, searchInviteClients]);

  useEffect(() => {
    if (!inviteMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (inviteWrapRef.current && !inviteWrapRef.current.contains(e.target as Node)) {
        setInviteMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [inviteMenuOpen]);

  const selectAll = () => setSelectedArtists([]);
  const selectArtist = (id: string) => setSelectedArtists([id]);

  const selectedLabel = allSelected
    ? t("schedule.allArtists")
    : singleArtistId
      ? safeName(profiles.find((p) => p.user_id === singleArtistId)?.display_name) || t("schedule.oneArtist")
      : t("schedule.allArtists");
  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => setCurrentDate(view === "day" ? addDays(currentDate, -1) : subWeeks(currentDate, 1));
  const goNext = () => setCurrentDate(view === "day" ? addDays(currentDate, 1) : addWeeks(currentDate, 1));

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const dateLabel =
    view === "day"
      ? format(currentDate, "EEE, d MMM yyyy")
      : `${format(weekStart, "d MMM")} – ${format(addDays(weekStart, 6), "d MMM yyyy")}`;

  const onInviteInputChange = (v: string) => {
    setInviteEmail(v);
    if (v.trim().length >= 2) setInviteMenuOpen(true);
    else {
      setInviteMenuOpen(false);
      setInviteSearchResults([]);
    }
  };

  return (
    <div className="border-b border-border bg-card px-3 py-2 md:px-5 md:py-3 shrink-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <div className="min-w-0">
            <h1 className="font-display text-lg md:text-xl font-bold text-gold">{t("schedule.title")}</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest hidden sm:block">{t("schedule.subtitle")}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 border-border bg-secondary/50">
                <Users className="h-3.5 w-3.5" />
                <span className="hidden sm:inline max-w-[100px] truncate">{selectedLabel}</span>
                <span className="sm:hidden">{allSelected ? profiles.length : selectedArtists.length}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">{t("schedule.filterArtists")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={allSelected} onCheckedChange={() => selectAll()}>
                {t("schedule.allArtistsCount", { count: profiles.length })}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {profiles.map((p) => (
                <DropdownMenuCheckboxItem
                  key={p.user_id}
                  checked={singleArtistId === p.user_id}
                  onCheckedChange={() => selectArtist(p.user_id)}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={p.avatar_url || undefined} />
                      <AvatarFallback className="text-[9px] font-bold">{safeName(p.display_name).charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{safeName(p.display_name)}</span>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-1" ref={inviteWrapRef}>
            <div className="relative w-[min(100%,170px)]">
              <Input
                type="text"
                value={inviteEmail}
                onChange={(e) => onInviteInputChange(e.target.value)}
                onFocus={() => {
                  if (inviteEmail.trim().length >= 2) setInviteMenuOpen(true);
                }}
                placeholder={t("schedule.invitePlaceholder")}
                className="h-8 w-full min-w-0 text-xs bg-secondary border-border pr-8"
                autoComplete="off"
              />
              {inviteSearchLoading && (
                <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground pointer-events-none" />
              )}
            {inviteMenuOpen && inviteEmail.trim().length >= 2 && inviteSearchResults.length > 0 && (
              <ul
                className="absolute z-[100] left-0 top-full mt-1 w-[min(100vw-2rem,280px)] max-h-52 overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
                role="listbox"
              >
                {inviteSearchResults.map((row) => (
                  <li key={row.email}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setInviteEmail(row.email);
                        setInviteMenuOpen(false);
                        setInviteSearchResults([]);
                      }}
                    >
                      <span className="flex items-center gap-1.5 font-medium text-xs">
                        <User className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        {row.name}
                      </span>
                      <span className="pl-5 text-[11px] text-muted-foreground line-clamp-1">{row.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {inviteMenuOpen && inviteEmail.trim().length >= 2 && !inviteSearchLoading && inviteSearchResults.length === 0 && (
              <p className="absolute z-[100] left-0 top-full mt-1 w-[min(100vw-2rem,280px)] rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
                {t("schedule.noInviteMatch")}
              </p>
            )}
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={onInviteClient} disabled={inviting}>
              {inviting ? "..." : t("schedule.invite")}
            </Button>
          </div>

          <Button variant="gold" size="sm" className="gap-1.5 text-xs h-8" onClick={onNewBooking}>
            <Plus className="h-3.5 w-3.5" /> {t("schedule.book")}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button type="button" onClick={goToday} className="px-2 py-1 text-xs font-medium hover:bg-secondary rounded-md transition-colors">
            {t("schedule.today")}
          </button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium text-muted-foreground ml-1 truncate max-w-[140px] sm:max-w-none">{dateLabel}</span>
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setView("day")}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              view === "day" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("schedule.day")}
          </button>
          <button
            type="button"
            onClick={() => setView("week")}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              view === "week" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("schedule.week")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleHeader;

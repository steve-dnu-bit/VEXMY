import { Search, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { type Service } from "./ServicePresets";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useScheduleI18n } from "@/hooks/useScheduleI18n";
import { type ArtistColorMap, resolveScheduleArtistColor } from "@/lib/artistThemeCache";
import { getThemePresetByBgColor } from "@/lib/themePresets";

interface Profile {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  portal_bg_color?: string | null;
}

interface ScheduleSidebarProps {
  profiles: Profile[];
  selectedArtists: string[];
  setSelectedArtists: (a: string[]) => void;
  teamSearch: string;
  setTeamSearch: (s: string) => void;
  services: Service[];
  artistColorCache: ArtistColorMap;
  currentDate: Date;
  setCurrentDate: (d: Date) => void;
}

function ArtistColorDot({ color }: { color: string | null }) {
  if (!color) return <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-muted" />;
  const preset = getThemePresetByBgColor(color);
  const dotColor = preset?.accentColor ?? color;
  return <div className="w-2.5 h-2.5 rounded-full shrink-0 border border-border/40" style={{ backgroundColor: dotColor }} />;
}

const ScheduleSidebar = ({
  profiles,
  selectedArtists,
  setSelectedArtists,
  teamSearch,
  setTeamSearch,
  services,
  artistColorCache,
  currentDate,
  setCurrentDate,
}: ScheduleSidebarProps) => {
  const { t } = useScheduleI18n();
  const filteredProfiles = profiles.filter((p) => p.display_name.toLowerCase().includes(teamSearch.toLowerCase()));
  const selectedId = selectedArtists.length === 0 ? "all" : selectedArtists[0];
  const selectedProfile = profiles.find((p) => p.user_id === selectedId) ?? null;
  const filteredWithSelected =
    selectedId === "all"
      ? filteredProfiles
      : filteredProfiles.some((p) => p.user_id === selectedId)
        ? filteredProfiles
        : [...filteredProfiles, ...(selectedProfile ? [selectedProfile] : [])];

  return (
    <div className="themed-scrollbar flex min-w-0 flex-col h-full overflow-y-scroll overflow-x-hidden overscroll-contain bg-card/70 backdrop-blur-md">
      <div className="min-w-0 p-3 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          {t("schedule.pickDate")}
        </p>
        <div className="rounded-xl border border-border bg-secondary/35 px-2 py-1 backdrop-blur-sm">
          <Calendar
            mode="single"
            selected={currentDate}
            onSelect={(d) => d && setCurrentDate(d)}
            className="w-full p-0"
            classNames={{
              months: "flex w-full flex-col",
              month: "w-full space-y-2",
              table: "w-full border-collapse",
              head_row: "grid grid-cols-7",
              row: "mt-1 grid grid-cols-7",
              head_cell: "w-auto text-center text-[0.7rem] text-muted-foreground",
              cell: "h-8 w-auto p-0 text-center text-xs",
              day: "h-8 w-8 p-0 font-normal",
              day_selected:
                "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary rounded-md",
              day_today: "bg-accent/30 text-accent-foreground rounded-md",
            }}
          />
        </div>
      </div>

      <div className="min-w-0 p-3 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{t("schedule.services")}</p>
        <div className="space-y-1 min-w-0">
          {services.map((s) => (
            <div
              key={s.id}
              className="flex min-w-0 items-center gap-2 py-1.5 px-2 rounded-lg text-xs bg-secondary/40 border border-border/60 hover:bg-secondary/60 transition-colors"
            >
              <span className="min-w-0 truncate text-foreground font-medium">{s.name}</span>
              <span className="ml-auto text-muted-foreground text-[10px] tabular-nums">{s.duration} min</span>
            </div>
          ))}
          {services.length === 0 && <p className="text-[11px] text-muted-foreground">{t("schedule.addServicesHint")}</p>}
        </div>
      </div>

      <div className="min-w-0 p-3 flex-1 pb-6 md:pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{t("schedule.team")}</p>
        <div className="space-y-1 min-w-0 mb-3">
          {profiles
            .slice()
            .sort((a, b) => a.display_name.localeCompare(b.display_name))
            .map((p) => {
              const color = resolveScheduleArtistColor(p.user_id, p.portal_bg_color, artistColorCache);
              return (
                <div
                  key={p.user_id}
                  className="flex min-w-0 items-center gap-2 py-1.5 px-2 rounded-lg text-xs bg-secondary/40 border border-border/60"
                >
                  <ArtistColorDot color={color} />
                  <span className="min-w-0 truncate text-foreground font-medium">{p.display_name}</span>
                </div>
              );
            })}
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("schedule.searchArtists")}
            value={teamSearch}
            onChange={(e) => setTeamSearch(e.target.value)}
            className="pl-8 h-9 text-xs bg-secondary border-border"
          />
        </div>
        <Select
          value={selectedId}
          onValueChange={(v) => {
            if (v === "all") setSelectedArtists([]);
            else setSelectedArtists([v]);
          }}
        >
          <SelectTrigger className="h-9 text-xs bg-secondary border-border">
            <SelectValue placeholder={t("schedule.selectArtist")}>
              {selectedId === "all" ? t("schedule.allArtistsCount", { count: profiles.length }) : selectedProfile?.display_name || t("schedule.artist")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("schedule.allArtists")}</SelectItem>
            {filteredWithSelected
              .slice()
              .sort((a, b) => a.display_name.localeCompare(b.display_name))
              .map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  {p.display_name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default ScheduleSidebar;

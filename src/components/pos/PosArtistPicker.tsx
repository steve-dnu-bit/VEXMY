import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { type ArtistColorMap, resolveScheduleArtistColor } from "@/lib/artistThemeCache";
import { getArtistBookingBlockStyle, getThemePresetByBgColor, hexToRgba } from "@/lib/themePresets";

export type PosArtistOption = {
  user_id: string;
  display_name: string;
  portal_bg_color?: string | null;
};

function artistButtonStyle(color: string, selected: boolean): CSSProperties {
  const blockStyle = getArtistBookingBlockStyle(color);
  if (selected && blockStyle) return blockStyle;

  const preset = getThemePresetByBgColor(color);
  const bg = preset?.bgColor ?? color;
  const accent = preset?.accentColor ?? color;

  if (selected) {
    return {
      backgroundColor: hexToRgba(bg, 0.55),
      borderColor: hexToRgba(accent, 0.95),
      color: accent,
    };
  }

  return {
    backgroundColor: hexToRgba(bg, 0.22),
    borderColor: hexToRgba(accent, 0.4),
    color: accent,
  };
}

interface PosArtistPickerProps {
  artists: PosArtistOption[];
  artistId: string;
  onArtistIdChange: (id: string) => void;
  colorCache: ArtistColorMap;
  label: string;
  hint?: string;
}

const PosArtistPicker = ({
  artists,
  artistId,
  onArtistIdChange,
  colorCache,
  label,
  hint,
}: PosArtistPickerProps) => (
  <div className="space-y-3">
    <div>
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground mt-1 leading-snug">{hint}</p> : null}
    </div>
    <div
      className={cn(
        "grid gap-3",
        artists.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2",
      )}
      role="group"
      aria-label={label}
    >
      {artists.map((artist) => {
        const color = resolveScheduleArtistColor(artist.user_id, artist.portal_bg_color, colorCache);
        const selected = artistId === artist.user_id;
        return (
          <button
            key={artist.user_id}
            type="button"
            onClick={() => onArtistIdChange(artist.user_id)}
            className={cn(
              "relative flex min-h-[4rem] items-center justify-center rounded-xl border-2 px-4 py-3 transition-all",
              "text-lg sm:text-xl font-semibold leading-tight",
              selected
                ? "ring-2 ring-gold ring-offset-2 ring-offset-background shadow-lg scale-[1.01]"
                : "hover:scale-[1.005] active:scale-[0.99]",
            )}
            style={artistButtonStyle(color, selected)}
            aria-pressed={selected}
          >
            <span className="text-center px-6">{artist.display_name}</span>
            {selected ? (
              <Check className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 shrink-0 opacity-90" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  </div>
);

export default PosArtistPicker;

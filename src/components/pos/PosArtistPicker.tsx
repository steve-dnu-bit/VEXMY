import { useState } from "react";
import type { CSSProperties } from "react";
import { Building2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { POS_SHOP_SESSION_ID } from "@/lib/posCheckout";
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
  showShopOption?: boolean;
  shopLabel?: string;
  shopHint?: string;
  changeSelectionLabel?: string;
  hideSelectionLabel?: string;
}

const PosArtistPicker = ({
  artists,
  artistId,
  onArtistIdChange,
  colorCache,
  label,
  hint,
  showShopOption = false,
  shopLabel = "Shop",
  shopHint,
  changeSelectionLabel = "Change artist or shop",
  hideSelectionLabel = "Done",
}: PosArtistPickerProps) => {
  const shopSelected = artistId === POS_SHOP_SESSION_ID;
  const optionCount = artists.length + (showShopOption ? 1 : 0);
  const canCollapse = optionCount > 1;
  const [expanded, setExpanded] = useState(false);

  const handleSelect = (id: string) => {
    onArtistIdChange(id);
    if (canCollapse) setExpanded(false);
  };

  const selectedArtist = shopSelected ? undefined : artists.find((a) => a.user_id === artistId);

  const renderShopButton = (selected: boolean, onSelect: (id: string) => void) => (
    <button
      type="button"
      onClick={() => onSelect(POS_SHOP_SESSION_ID)}
      className={cn(
        "relative flex min-h-[4rem] w-full items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 transition-all",
        "text-lg sm:text-xl font-semibold leading-tight",
        selected
          ? "ring-2 ring-gold ring-offset-2 ring-offset-background shadow-lg scale-[1.01] border-gold/80 bg-gold/10 text-gold"
          : "border-border bg-muted/30 hover:scale-[1.005] active:scale-[0.99]",
      )}
      aria-pressed={selected}
    >
      <Building2 className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
      <span className="text-center">{shopLabel}</span>
      {selected ? (
        <Check className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 shrink-0 opacity-90" aria-hidden />
      ) : null}
    </button>
  );

  const renderArtistButton = (
    artist: PosArtistOption,
    selected: boolean,
    onSelect: (id: string) => void,
  ) => {
    const color = resolveScheduleArtistColor(artist.user_id, artist.portal_bg_color, colorCache);
    return (
      <button
        key={artist.user_id}
        type="button"
        onClick={() => onSelect(artist.user_id)}
        className={cn(
          "relative flex min-h-[4rem] w-full items-center justify-center rounded-xl border-2 px-4 py-3 transition-all",
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
  };

  const renderOptionGrid = (onSelect: (id: string) => void) => (
    <div
      className={cn(
        "grid gap-3",
        artists.length <= 1 && !showShopOption ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2",
      )}
      role="group"
      aria-label={label}
    >
      {showShopOption ? renderShopButton(shopSelected, onSelect) : null}
      {artists.map((artist) => renderArtistButton(artist, artistId === artist.user_id, onSelect))}
    </div>
  );

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
        {hint && (!canCollapse || expanded) ? (
          <p className="text-xs text-muted-foreground mt-1 leading-snug">{hint}</p>
        ) : null}
      </div>

      {canCollapse && !expanded ? (
        <div className="space-y-2">
          {shopSelected
            ? renderShopButton(true, handleSelect)
            : selectedArtist
              ? renderArtistButton(selectedArtist, true, handleSelect)
              : null}
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between text-sm"
            onClick={() => setExpanded(true)}
            aria-expanded={false}
          >
            <span>{changeSelectionLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {renderOptionGrid(handleSelect)}
          {canCollapse ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between text-sm text-muted-foreground"
              onClick={() => setExpanded(false)}
              aria-expanded
            >
              <span>{hideSelectionLabel}</span>
              <ChevronUp className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
            </Button>
          ) : null}
        </div>
      )}

      {showShopOption && shopSelected && shopHint ? (
        <p className="text-xs text-muted-foreground leading-snug">{shopHint}</p>
      ) : null}
    </div>
  );
};

export default PosArtistPicker;

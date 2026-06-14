import { THEME_PRESETS } from "@/lib/themePresets";

const SCHEDULE_ARTIST_COLORS_KEY = "velbok.scheduleArtistColors";
const PORTAL_THEME_KEY_PREFIX = "velbok.portalTheme.";

export type ArtistColorMap = Record<string, string>;

const SCHEDULE_COLOR_PALETTE = THEME_PRESETS.map((p) => p.bgColor);

/** Stable pseudo-random color per artist id (same artist always gets the same color). */
export function pickStableScheduleArtistColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return SCHEDULE_COLOR_PALETTE[hash % SCHEDULE_COLOR_PALETTE.length];
}

export function resolveScheduleArtistColor(
  artistId: string,
  portalBgColor: string | null | undefined,
  cache: ArtistColorMap,
): string | null {
  return portalBgColor ?? cache[artistId] ?? null;
}

export function readScheduleArtistColors(): ArtistColorMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SCHEDULE_ARTIST_COLORS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const map: ArtistColorMap = {};
    for (const [id, color] of Object.entries(parsed)) {
      if (typeof id === "string" && typeof color === "string" && color.trim()) {
        map[id] = color;
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function writeScheduleArtistColors(
  profiles: Array<{ user_id: string; portal_bg_color?: string | null }>,
  extraArtistIds: string[] = [],
): ArtistColorMap {
  const existing = readScheduleArtistColors();
  const map: ArtistColorMap = { ...existing };
  for (const p of profiles) {
    if (p.portal_bg_color) {
      map[p.user_id] = p.portal_bg_color;
    } else if (!map[p.user_id]) {
      map[p.user_id] = pickStableScheduleArtistColor(p.user_id);
    }
  }
  for (const id of extraArtistIds) {
    if (!map[id]) map[id] = pickStableScheduleArtistColor(id);
  }
  if (typeof window !== "undefined") {
    sessionStorage.setItem(SCHEDULE_ARTIST_COLORS_KEY, JSON.stringify(map));
  }
  return map;
}

export type CachedPortalTheme = { color: string | null; image: string | null };

export function readCachedPortalTheme(userId: string): CachedPortalTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${PORTAL_THEME_KEY_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPortalTheme;
    return {
      color: typeof parsed?.color === "string" ? parsed.color : null,
      image: typeof parsed?.image === "string" ? parsed.image : null,
    };
  } catch {
    return null;
  }
}

export function writeCachedPortalTheme(userId: string, theme: CachedPortalTheme): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${PORTAL_THEME_KEY_PREFIX}${userId}`, JSON.stringify(theme));
}

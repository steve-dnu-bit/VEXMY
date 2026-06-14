import { SCHEDULE_ARTIST_DEFAULT_PALETTE } from "@/lib/themePresets";

const SCHEDULE_ARTIST_COLORS_KEY = "velbok.scheduleArtistColors.v2";
const PORTAL_THEME_KEY_PREFIX = "velbok.portalTheme.";

export type ArtistColorMap = Record<string, string>;

function normalizeHex(hex: string): string {
  const clean = hex.trim().replace("#", "").toLowerCase();
  if (clean.length === 3) {
    return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
  }
  return `#${clean}`;
}

/** Stable fallback when cache has not been written yet (e.g. first paint). */
export function pickStableScheduleArtistColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return SCHEDULE_ARTIST_DEFAULT_PALETTE[hash % SCHEDULE_ARTIST_DEFAULT_PALETTE.length].bgColor;
}

function assignDistinctDefaultColors(
  artistIds: string[],
  profiles: Array<{ user_id: string; portal_bg_color?: string | null }>,
  map: ArtistColorMap,
): void {
  const portalById = new Map(profiles.map((p) => [p.user_id, p.portal_bg_color]));
  const usedColors = new Set<string>();

  for (const p of profiles) {
    if (p.portal_bg_color) usedColors.add(normalizeHex(p.portal_bg_color));
    if (map[p.user_id]) usedColors.add(normalizeHex(map[p.user_id]));
  }

  const needsColor = [...new Set(artistIds)]
    .filter((id) => !portalById.get(id) && !map[id])
    .sort();

  let paletteIndex = 0;
  for (const id of needsColor) {
    let picked = SCHEDULE_ARTIST_DEFAULT_PALETTE[paletteIndex % SCHEDULE_ARTIST_DEFAULT_PALETTE.length].bgColor;
    for (let attempt = 0; attempt < SCHEDULE_ARTIST_DEFAULT_PALETTE.length; attempt++) {
      const candidate =
        SCHEDULE_ARTIST_DEFAULT_PALETTE[(paletteIndex + attempt) % SCHEDULE_ARTIST_DEFAULT_PALETTE.length].bgColor;
      if (!usedColors.has(normalizeHex(candidate))) {
        picked = candidate;
        paletteIndex += attempt + 1;
        break;
      }
    }
    map[id] = picked;
    usedColors.add(normalizeHex(picked));
    paletteIndex++;
  }
}

export function resolveScheduleArtistColor(
  artistId: string,
  portalBgColor: string | null | undefined,
  cache: ArtistColorMap,
): string {
  return portalBgColor ?? cache[artistId] ?? pickStableScheduleArtistColor(artistId);
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
    }
  }

  const allArtistIds = [...profiles.map((p) => p.user_id), ...extraArtistIds];
  assignDistinctDefaultColors(allArtistIds, profiles, map);

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

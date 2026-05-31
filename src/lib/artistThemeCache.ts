const SCHEDULE_ARTIST_COLORS_KEY = "velbok.scheduleArtistColors";
const PORTAL_THEME_KEY_PREFIX = "velbok.portalTheme.";

export type ArtistColorMap = Record<string, string>;

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
): void {
  if (typeof window === "undefined") return;
  const existing = readScheduleArtistColors();
  const map: ArtistColorMap = { ...existing };
  for (const p of profiles) {
    if (p.portal_bg_color) map[p.user_id] = p.portal_bg_color;
  }
  sessionStorage.setItem(SCHEDULE_ARTIST_COLORS_KEY, JSON.stringify(map));
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

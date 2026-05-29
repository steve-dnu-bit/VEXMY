export interface ThemePreset {
  key: string;
  label: string;
  bgColor: string;
  accentColor: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { key: "pink", label: "Pink", bgColor: "#7a2455", accentColor: "#ff4fb3" },
  { key: "purple", label: "Purple", bgColor: "#5a35b8", accentColor: "#c49bff" },
  { key: "golden", label: "Golden", bgColor: "#8a5f13", accentColor: "#ffd447" },
  { key: "black", label: "Black", bgColor: "#141416", accentColor: "#ffcc33" },
  { key: "grey", label: "Grey", bgColor: "#59606d", accentColor: "#eef3ff" },
  { key: "white", label: "White", bgColor: "#ffffff", accentColor: "#2b6fff" },
  { key: "teal", label: "Teal", bgColor: "#1f7a74", accentColor: "#3cf2df" },
  { key: "ink-red", label: "Ink Red", bgColor: "#8a2430", accentColor: "#ff5d6f" },
];

function normalizeHex(hex: string): string {
  const clean = hex.trim().replace("#", "").toLowerCase();
  if (clean.length === 3) {
    return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
  }
  return `#${clean}`;
}

export function getThemePresetByBgColor(color: string | null | undefined): ThemePreset | null {
  if (!color) return null;
  const normalized = normalizeHex(color);
  return THEME_PRESETS.find((p) => normalizeHex(p.bgColor) === normalized) ?? null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex).replace("#", "");
  if (normalized.length !== 6) return null;
  const n = Number.parseInt(normalized, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(128, 128, 128, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** Inline styles for a schedule booking block from an artist's portal theme color. */
export function getArtistBookingBlockStyle(
  portalBgColor: string | null | undefined,
  options?: { cancelled?: boolean },
): { backgroundColor: string; borderColor: string; color: string } | null {
  if (options?.cancelled) {
    return {
      backgroundColor: hexToRgba("#f43f5e", 0.15),
      borderColor: hexToRgba("#fb7185", 0.4),
      color: "#fda4af",
    };
  }
  if (!portalBgColor) return null;
  const preset = getThemePresetByBgColor(portalBgColor);
  const bg = preset?.bgColor ?? portalBgColor;
  const accent = preset?.accentColor ?? portalBgColor;
  return {
    backgroundColor: hexToRgba(bg, 0.38),
    borderColor: hexToRgba(accent, 0.55),
    color: accent,
  };
}


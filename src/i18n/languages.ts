export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "ro", label: "Romanian", nativeLabel: "Română" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "sv", label: "Swedish", nativeLabel: "Svenska" },
  { code: "no", label: "Norwegian", nativeLabel: "Norsk" },
  { code: "nl", label: "Dutch", nativeLabel: "Nederlands" },
  { code: "bg", label: "Bulgarian", nativeLabel: "Български" },
] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: AppLanguage = "en";

export const LANGUAGE_STORAGE_KEY = "velbok.appLanguage";
export const LANGUAGE_SOURCE_KEY = "velbok.appLanguageSource";

export type LanguageSource = "user" | "ip" | "navigator" | "profile";

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return SUPPORTED_LANGUAGES.some((l) => l.code === value);
}

export function getStoredLanguageSource(): LanguageSource | null {
  if (typeof window === "undefined") return null;
  const source = window.localStorage.getItem(LANGUAGE_SOURCE_KEY);
  if (source === "user" || source === "ip" || source === "navigator" || source === "profile") {
    return source;
  }
  return null;
}

/** True when we should reuse localStorage and skip IP geo detection. */
export function hasResolvedLanguageChoice(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (!isAppLanguage(stored)) return false;
  const source = getStoredLanguageSource();
  if (source === "user" || source === "profile" || source === "ip" || source === "navigator") {
    return true;
  }
  return false;
}

export function persistLanguageChoice(lang: AppLanguage, source: LanguageSource): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  window.localStorage.setItem(LANGUAGE_SOURCE_KEY, source);
}

/** Default app locale for a supported Velbok shop country (from IP geo / setup wizard). */
export function appLanguageFromShopCountry(country: string | null | undefined): AppLanguage | null {
  const code = (country || "").trim().toUpperCase();
  const map: Record<string, AppLanguage> = {
    UK: "en",
    GB: "en",
    US: "en",
    CA: "en",
    AU: "en",
    DE: "de",
    FR: "fr",
    RO: "ro",
    IT: "it",
    ES: "es",
    SE: "sv",
    NO: "no",
    NL: "nl",
    BG: "bg",
  };
  return map[code] ?? null;
}

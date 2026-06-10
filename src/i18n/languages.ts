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

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return SUPPORTED_LANGUAGES.some((l) => l.code === value);
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

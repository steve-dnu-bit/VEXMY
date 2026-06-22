import i18n from "@/i18n";
import { DEFAULT_LANGUAGE, isAppLanguage, LANGUAGE_STORAGE_KEY, type AppLanguage } from "@/i18n/languages";

const loadedLocales = new Set<AppLanguage>([DEFAULT_LANGUAGE]);

type LocalePack = {
  translation: Record<string, unknown>;
  docs: Record<string, unknown>;
};

const localeLoaders: Record<Exclude<AppLanguage, "en">, () => Promise<LocalePack>> = {
  de: async () => ({
    translation: (await import("./locales/de.json")).default,
    docs: (await import("./locales/docs/de.json")).default,
  }),
  fr: async () => ({
    translation: (await import("./locales/fr.json")).default,
    docs: (await import("./locales/docs/fr.json")).default,
  }),
  ro: async () => ({
    translation: (await import("./locales/ro.json")).default,
    docs: (await import("./locales/docs/ro.json")).default,
  }),
  it: async () => ({
    translation: (await import("./locales/it.json")).default,
    docs: (await import("./locales/docs/it.json")).default,
  }),
  es: async () => ({
    translation: (await import("./locales/es.json")).default,
    docs: (await import("./locales/docs/es.json")).default,
  }),
  sv: async () => ({
    translation: (await import("./locales/sv.json")).default,
    docs: (await import("./locales/docs/sv.json")).default,
  }),
  no: async () => ({
    translation: (await import("./locales/no.json")).default,
    docs: (await import("./locales/docs/no.json")).default,
  }),
  nl: async () => ({
    translation: (await import("./locales/nl.json")).default,
    docs: (await import("./locales/docs/nl.json")).default,
  }),
  bg: async () => ({
    translation: (await import("./locales/bg.json")).default,
    docs: (await import("./locales/docs/bg.json")).default,
  }),
};

export async function ensureLanguageLoaded(lng: AppLanguage): Promise<void> {
  if (loadedLocales.has(lng)) return;

  if (lng === "en") {
    loadedLocales.add("en");
    return;
  }

  const pack = await localeLoaders[lng]();
  i18n.addResourceBundle(lng, "translation", pack.translation, true, true);
  i18n.addResourceBundle(lng, "docs", pack.docs, true, true);
  loadedLocales.add(lng);
}

export async function changeAppLanguage(lng: AppLanguage): Promise<void> {
  await ensureLanguageLoaded(lng);
  await i18n.changeLanguage(lng);
}

export function getStoredAppLanguage(): AppLanguage | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isAppLanguage(stored) ? stored : null;
}

/** Preload a saved non-English locale without blocking first paint. */
export async function preloadStoredLanguage(): Promise<void> {
  const stored = getStoredAppLanguage();
  if (!stored || stored === DEFAULT_LANGUAGE) return;
  await ensureLanguageLoaded(stored);
  if (i18n.language !== stored) {
    await i18n.changeLanguage(stored);
  }
}

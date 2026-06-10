import i18n from "@/i18n";
import { hasResolvedLanguageChoice, isAppLanguage, persistLanguageChoice } from "@/i18n/languages";
import { detectAppLanguageFromIp } from "@/lib/detectShopCountry";

async function applyNavigatorFallback(): Promise<void> {
  const base = navigator.language?.split("-")[0];
  if (isAppLanguage(base)) {
    await i18n.changeLanguage(base);
    persistLanguageChoice(base, "navigator");
  }
}

/** Resolve visitor language from IP before first paint (skipped when user already chose). */
export async function bootstrapLanguageFromIp(): Promise<void> {
  if (typeof window === "undefined") return;
  if (hasResolvedLanguageChoice()) return;

  const fromIp = await detectAppLanguageFromIp();
  if (fromIp) {
    await i18n.changeLanguage(fromIp);
    persistLanguageChoice(fromIp, "ip");
    return;
  }

  await applyNavigatorFallback();
}

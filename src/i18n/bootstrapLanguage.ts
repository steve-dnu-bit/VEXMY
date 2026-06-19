import i18n from "@/i18n";
import { DEFAULT_LANGUAGE, hasResolvedLanguageChoice, persistLanguageChoice } from "@/i18n/languages";

/** Ensure first-time visitors start in English (no IP or device-locale guessing). */
export async function bootstrapLanguageFromIp(): Promise<void> {
  if (typeof window === "undefined") return;
  if (hasResolvedLanguageChoice()) return;

  await i18n.changeLanguage(DEFAULT_LANGUAGE);
  persistLanguageChoice(DEFAULT_LANGUAGE, "default");
}

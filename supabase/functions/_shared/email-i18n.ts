import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import en from "./email-locales/en.json" assert { type: "json" };
import de from "./email-locales/de.json" assert { type: "json" };
import fr from "./email-locales/fr.json" assert { type: "json" };
import ro from "./email-locales/ro.json" assert { type: "json" };
import it from "./email-locales/it.json" assert { type: "json" };
import es from "./email-locales/es.json" assert { type: "json" };
import sv from "./email-locales/sv.json" assert { type: "json" };
import no from "./email-locales/no.json" assert { type: "json" };
import nl from "./email-locales/nl.json" assert { type: "json" };
import bg from "./email-locales/bg.json" assert { type: "json" };

export type EmailLanguage = "en" | "de" | "fr" | "ro" | "it" | "es" | "sv" | "no" | "nl" | "bg";

const LOCALES: Record<EmailLanguage, unknown> = {
  en,
  de,
  fr,
  ro,
  it,
  es,
  sv,
  no,
  nl,
  bg,
};

const DATE_LOCALE_BY_EMAIL_LANGUAGE: Record<EmailLanguage, string> = {
  en: "en-GB",
  de: "de-DE",
  fr: "fr-FR",
  ro: "ro-RO",
  it: "it-IT",
  es: "es-ES",
  sv: "sv-SE",
  no: "no-NO",
  nl: "nl-NL",
  bg: "bg-BG",
};

export function emailLocaleToIntlDateLocale(locale: EmailLanguage): string {
  return DATE_LOCALE_BY_EMAIL_LANGUAGE[locale] ?? DATE_LOCALE_BY_EMAIL_LANGUAGE.en;
}

export function emailLocaleToHtmlLang(locale: EmailLanguage): string {
  return locale;
}

function isSupportedLanguage(value: unknown): value is EmailLanguage {
  return typeof value === "string" && (Object.keys(LOCALES) as EmailLanguage[]).includes(value as EmailLanguage);
}

function normalizeLanguageCode(code: string | null | undefined): EmailLanguage | null {
  if (!code) return null;
  const norm = code.trim().toLowerCase();
  if (!norm) return null;
  if (norm === "uk") return "en";
  return isSupportedLanguage(norm) ? (norm as EmailLanguage) : null;
}

function getByDotPath(obj: unknown, dotPath: string): unknown {
  const parts = dotPath.split(".");
  let cur: any = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object" || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function interpolate(template: string, vars: Record<string, string | number> | undefined): string {
  if (!vars) return template;
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key) => {
    const v = vars[key];
    return v === undefined ? full : String(v);
  });
}

export function t(
  locale: EmailLanguage,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const primary = LOCALES[locale] ?? LOCALES.en;
  const val = getByDotPath(primary, key);
  if (typeof val === "string") return interpolate(val, vars);

  const fallbackVal = getByDotPath(LOCALES.en, key);
  if (typeof fallbackVal === "string") return interpolate(fallbackVal, vars);

  return key;
}

function appLanguageFromShopCountry(countryCode: string | null | undefined): EmailLanguage | null {
  const code = (countryCode || "").trim().toUpperCase();
  const map: Record<string, EmailLanguage> = {
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

export async function resolveEmailLocale(
  admin: SupabaseClient,
  params: {
    recipientEmail?: string | null;
    recipientUserId?: string | null;
    organizationId?: string | null;
  },
): Promise<EmailLanguage> {
  if (params.recipientUserId) {
    const { data: profileRow } = await admin
      .from("profiles")
      .select("app_language_preference")
      .eq("user_id", params.recipientUserId)
      .maybeSingle();

    const normalized = normalizeLanguageCode((profileRow as any)?.app_language_preference);
    if (normalized) return normalized;
  }

  if (params.organizationId) {
    const { data } = await admin.rpc("get_org_billing_context", {
      _org_id: params.organizationId,
    });
    const countryCode = (data as any)?.country_code as string | null | undefined;
    const fromCountry = appLanguageFromShopCountry(countryCode);
    if (fromCountry) return fromCountry;
  }

  return "en";
}


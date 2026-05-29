export const COOKIE_CONSENT_VERSION = "2026-05-04";
export const COOKIE_CONSENT_STORAGE_KEY = "vexmy.cookieConsent.v1";

export type CookieCategory = "necessary" | "preferences" | "analytics" | "marketing";

export type CookieConsent = {
  version: string;
  updatedAt: string;
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  method: "accept_all" | "reject_non_essential" | "customize";
};

const defaultConsent: CookieConsent = {
  version: COOKIE_CONSENT_VERSION,
  updatedAt: "",
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
  method: "reject_non_essential",
};

export function getStoredCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    if (!parsed || parsed.version !== COOKIE_CONSENT_VERSION) return null;
    return {
      ...defaultConsent,
      ...parsed,
      necessary: true,
      version: COOKIE_CONSENT_VERSION,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveCookieConsent(consent: Omit<CookieConsent, "version" | "updatedAt" | "necessary"> & { necessary?: true }): CookieConsent {
  const next: CookieConsent = {
    version: COOKIE_CONSENT_VERSION,
    updatedAt: new Date().toISOString(),
    necessary: true,
    preferences: !!consent.preferences,
    analytics: !!consent.analytics,
    marketing: !!consent.marketing,
    method: consent.method,
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("cookie-consent:updated", { detail: next }));
  }
  return next;
}

export function clearCookieConsent() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(COOKIE_CONSENT_STORAGE_KEY);
}

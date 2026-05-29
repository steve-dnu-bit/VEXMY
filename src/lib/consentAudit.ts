import { supabase } from "@/integrations/supabase/client";
import type { CookieConsent } from "@/lib/cookieConsent";

export async function logCookieConsentAudit(consent: CookieConsent) {
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id ?? null;
    await supabase.from("cookie_consent_audit" as any).insert({
      user_id: userId,
      consent_version: consent.version,
      method: consent.method,
      necessary: true,
      preferences: consent.preferences,
      analytics: consent.analytics,
      marketing: consent.marketing,
      page_path: typeof window !== "undefined" ? window.location.pathname : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    } as any);
  } catch (error) {
    console.warn("Cookie consent audit logging failed", error);
  }
}

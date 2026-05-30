import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import i18n from "@/i18n";
import {
  DEFAULT_LANGUAGE,
  isAppLanguage,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
} from "@/i18n/languages";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  ready: boolean;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { i18n: i18nInstance } = useTranslation();
  const [ready, setReady] = useState(false);

  const language = isAppLanguage(i18nInstance.language) ? i18nInstance.language : DEFAULT_LANGUAGE;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (!user) {
        if (!cancelled) setReady(true);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("app_language_preference")
        .eq("user_id", user.id)
        .maybeSingle();
      const remote = (data as { app_language_preference?: string } | null)?.app_language_preference;
      if (!cancelled && isAppLanguage(remote) && remote !== i18nInstance.language) {
        await i18nInstance.changeLanguage(remote);
      }
      if (!cancelled) setReady(true);
    };
    void sync();
    return () => {
      cancelled = true;
    };
  }, [user, i18nInstance]);

  const setLanguage = useCallback(
    async (next: AppLanguage) => {
      await i18nInstance.changeLanguage(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      }
      if (user) {
        await supabase
          .from("profiles")
          .update({ app_language_preference: next } as any)
          .eq("user_id", user.id);
      }
    },
    [i18nInstance, user],
  );

  const value = useMemo(() => ({ language, setLanguage, ready }), [language, setLanguage, ready]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguagePreference() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguagePreference must be used within LanguageProvider");
  return ctx;
}

export { SUPPORTED_LANGUAGES };

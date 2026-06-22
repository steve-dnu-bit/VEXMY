import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { changeAppLanguage, ensureLanguageLoaded } from "@/i18n/loadLocale";
import {
  DEFAULT_LANGUAGE,
  hasResolvedLanguageChoice,
  isAppLanguage,
  LANGUAGE_STORAGE_KEY,
  persistLanguageChoice,
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
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("app_language_preference")
          .eq("user_id", user.id)
          .maybeSingle();
        const remote = (data as { app_language_preference?: string } | null)?.app_language_preference;
        if (!cancelled && isAppLanguage(remote)) {
          await ensureLanguageLoaded(remote);
          await i18nInstance.changeLanguage(remote);
          persistLanguageChoice(remote, "profile");
          setReady(true);
          return;
        }
      }

      if (hasResolvedLanguageChoice()) {
        const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (isAppLanguage(stored)) {
          await ensureLanguageLoaded(stored);
          await i18nInstance.changeLanguage(stored);
        }
        if (!cancelled) setReady(true);
        return;
      }

      if (!cancelled) {
        await i18nInstance.changeLanguage(DEFAULT_LANGUAGE);
        persistLanguageChoice(DEFAULT_LANGUAGE, "default");
      }

      if (!cancelled) setReady(true);
    };

    void sync();
    return () => {
      cancelled = true;
    };
  }, [user?.id, i18nInstance]);

  const setLanguage = useCallback(
    async (next: AppLanguage) => {
      await changeAppLanguage(next);
      persistLanguageChoice(next, "user");
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

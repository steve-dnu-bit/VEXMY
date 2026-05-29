import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppTheme = "dark" | "light";

type ThemeContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => Promise<void>;
  ready: boolean;
};

const THEME_STORAGE_KEY = "vexmy.appTheme";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyThemeToDom(theme: AppTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<AppTheme>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" ? "light" : "dark";
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const syncThemeFromProfile = async () => {
      if (!user) {
        if (!cancelled) setReady(true);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("app_theme_preference")
        .eq("user_id", user.id)
        .maybeSingle();
      const remoteTheme = (data as { app_theme_preference?: string } | null)?.app_theme_preference;
      if (!cancelled && (remoteTheme === "light" || remoteTheme === "dark")) {
        setThemeState(remoteTheme);
      }
      if (!cancelled) setReady(true);
    };
    void syncThemeFromProfile();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setTheme = async (nextTheme: AppTheme) => {
    setThemeState(nextTheme);
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ app_theme_preference: nextTheme } as any)
      .eq("user_id", user.id);
  };

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme, ready }), [theme, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useThemePreference() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemePreference must be used within ThemeProvider");
  return ctx;
}


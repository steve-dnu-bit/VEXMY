import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;
    const finish = (nextUser: User | null) => {
      if (settled) return;
      settled = true;
      setUser(nextUser);
      setLoading(false);
    };

    const timeout = window.setTimeout(() => finish(null), 8000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      window.clearTimeout(timeout);
      finish(session?.user ?? null);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        window.clearTimeout(timeout);
        finish(session?.user ?? null);
      })
      .catch(() => {
        window.clearTimeout(timeout);
        finish(null);
      });

    return () => {
      settled = true;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

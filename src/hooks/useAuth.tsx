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
    let cancelled = false;

    const syncUser = (nextUser: User | null) => {
      if (cancelled) return;
      setUser((prev) => {
        const prevId = prev?.id ?? null;
        const nextId = nextUser?.id ?? null;
        if (prevId === nextId) return prev;
        return nextUser;
      });
      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refresh is silent — avoid re-rendering the whole app tree.
      if (event === "TOKEN_REFRESHED") return;
      syncUser(session?.user ?? null);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        syncUser(session?.user ?? null);
      })
      .catch(() => {
        syncUser(null);
      });

    return () => {
      cancelled = true;
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

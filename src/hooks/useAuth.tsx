import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { needsMfaVerification } from "@/lib/mfa";
import { checkTrustedDeviceBypass } from "@/lib/trustedDevice";

async function trustedDeviceBypassWithTimeout(ms = 4000): Promise<boolean> {
  try {
    return await Promise.race([
      checkTrustedDeviceBypass(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
    ]);
  } catch {
    return false;
  }
}

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  mfaVerificationRequired: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaVerificationRequired, setMfaVerificationRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const applySession = async (session: Session | null, markLoading: boolean) => {
      if (markLoading) setLoading(true);

      const nextUser = session?.user ?? null;
      let mfaRequired = false;
      if (nextUser) {
        try {
          mfaRequired = await needsMfaVerification(session);
          if (mfaRequired) {
            const trusted = await trustedDeviceBypassWithTimeout();
            if (trusted) mfaRequired = false;
          }
        } catch {
          mfaRequired = false;
        }
      }

      if (cancelled) return;

      setUser((prev) => {
        const prevId = prev?.id ?? null;
        const nextId = nextUser?.id ?? null;
        if (prevId === nextId) return prev;
        return nextUser;
      });
      setMfaVerificationRequired(mfaRequired);
      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      const markLoading = event === "SIGNED_OUT";
      void applySession(session, markLoading);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        void applySession(session, false);
      })
      .catch(() => {
        void applySession(null, false);
      });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, mfaVerificationRequired }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

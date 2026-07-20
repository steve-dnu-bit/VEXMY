import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { needsMfaVerification } from "@/lib/mfa";
import { checkTrustedDeviceBypass } from "@/lib/trustedDevice";

const SESSION_RESTORE_MS = 8_000;
const MFA_CHECK_MS = 5_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function trustedDeviceBypassWithTimeout(ms = 4000): Promise<boolean> {
  try {
    return await withTimeout(checkTrustedDeviceBypass(), ms, false);
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
          mfaRequired = await withTimeout(needsMfaVerification(session), MFA_CHECK_MS, false);
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

    // Force-kill cold start: getSession / token refresh can hang via CapacitorHttp.
    // Never leave the shell on loading forever (looks like a black screen).
    void (async () => {
      try {
        const result = await withTimeout(
          supabase.auth.getSession(),
          SESSION_RESTORE_MS,
          { data: { session: null }, error: null } as Awaited<ReturnType<typeof supabase.auth.getSession>>,
        );
        if (cancelled) return;
        await applySession(result.data.session, false);
      } catch {
        if (!cancelled) await applySession(null, false);
      }
    })();

    const hardFailsafe = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, SESSION_RESTORE_MS + MFA_CHECK_MS + 1_000);

    return () => {
      cancelled = true;
      window.clearTimeout(hardFailsafe);
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

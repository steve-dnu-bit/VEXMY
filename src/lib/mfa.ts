import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

/** True when the user signed in but still needs a TOTP code (AAL1 → AAL2). */
export async function needsMfaVerification(session?: Session | null): Promise<boolean> {
  const activeSession =
    session !== undefined
      ? session
      : (await supabase.auth.getSession()).data.session ?? null;
  if (!activeSession) return false;

  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;

  return data.currentLevel === "aal1" && data.nextLevel === "aal2";
}

export async function getPrimaryVerifiedTotpFactorId(): Promise<string | null> {
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp?.filter((f) => f.status === "verified") ?? [];
  return verified[0]?.id ?? null;
}

export async function getVerifiedMfaFactorIds(): Promise<string[]> {
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp?.filter((f) => f.status === "verified") ?? [];
  return verified.map((f) => f.id);
}

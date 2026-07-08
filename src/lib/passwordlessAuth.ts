import { supabase } from "@/integrations/supabase/client";
import { getAuthSiteOrigin } from "@/lib/oauth";

/** Normalize user input to E.164 (defaults to UK +44). */
export function toE164Phone(input: string, defaultCountryCode = "44"): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    const digits = "+" + trimmed.slice(1).replace(/\D/g, "");
    return digits.length > 2 ? digits : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("0")) return "+" + defaultCountryCode + digits.slice(1);
  return "+" + digits;
}

export async function sendEmailMagicLink(email: string, redirectPath = "/auth"): Promise<{ error: Error | null }> {
  const redirectTo = `${getAuthSiteOrigin()}${redirectPath}`;
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });
  return { error: error ? new Error(error.message) : null };
}

export async function sendPhoneOtp(phone: string): Promise<{ error: Error | null }> {
  const e164 = toE164Phone(phone);
  if (!e164) return { error: new Error("invalid_phone") };
  const { error } = await supabase.auth.signInWithOtp({
    phone: e164,
    options: { shouldCreateUser: false },
  });
  return { error: error ? new Error(error.message) : null };
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<{ error: Error | null }> {
  const e164 = toE164Phone(phone);
  if (!e164) return { error: new Error("invalid_phone") };
  const { error } = await supabase.auth.verifyOtp({
    phone: e164,
    token: token.replace(/\D/g, ""),
    type: "sms",
  });
  return { error: error ? new Error(error.message) : null };
}

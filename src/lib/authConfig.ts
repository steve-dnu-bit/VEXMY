/** Google OAuth — disable with VITE_GOOGLE_SIGN_IN_ENABLED=false */
export const GOOGLE_SIGN_IN_ENABLED = import.meta.env.VITE_GOOGLE_SIGN_IN_ENABLED !== "false";

/** Apple OAuth — enable when Apple provider is configured in Supabase (VITE_APPLE_SIGN_IN_ENABLED=true). */
export const APPLE_SIGN_IN_ENABLED = import.meta.env.VITE_APPLE_SIGN_IN_ENABLED === "true";

/**
 * Phone OTP sign-in (not MFA) — uses Twilio per SMS, not the Advanced Phone MFA add-on.
 * Requires Supabase Auth → Phone provider enabled. Off by default.
 */
export const PHONE_SIGN_IN_ENABLED = import.meta.env.VITE_PHONE_SIGN_IN_ENABLED === "true";

/** Capacitor deep link for native OAuth return (add to Supabase Auth redirect URLs). */
export const NATIVE_OAUTH_REDIRECT_URL = "com.velbok.app://auth/callback";

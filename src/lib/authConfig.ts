/** Production web origin — never use Capacitor https://localhost for OAuth redirects. */
export const AUTH_SITE_ORIGIN = (
  import.meta.env.VITE_SITE_URL?.trim() ||
  import.meta.env.VITE_SHOP_WEBSITE_URL?.trim() ||
  "https://velbok.com"
).replace(/\/$/, "");

/** Google OAuth — disable with VITE_GOOGLE_SIGN_IN_ENABLED=false */
export const GOOGLE_SIGN_IN_ENABLED = import.meta.env.VITE_GOOGLE_SIGN_IN_ENABLED !== "false";

/** Apple OAuth — enable when Apple provider is configured in Supabase (VITE_APPLE_SIGN_IN_ENABLED=true). */
export const APPLE_SIGN_IN_ENABLED = import.meta.env.VITE_APPLE_SIGN_IN_ENABLED === "true";

/**
 * Phone OTP sign-in (not MFA) — uses Twilio per SMS, not the Advanced Phone MFA add-on.
 * Requires Supabase Auth → Phone provider enabled. Off by default.
 */
export const PHONE_SIGN_IN_ENABLED = import.meta.env.VITE_PHONE_SIGN_IN_ENABLED === "true";

/** Deep link — app receives OAuth params after HTTPS passthrough page. */
export const NATIVE_OAUTH_REDIRECT_URL = "com.velbok.app://auth/callback";

/** HTTPS redirect registered in Supabase; forwards to NATIVE_OAUTH_REDIRECT_URL (no PKCE exchange here). */
export const NATIVE_OAUTH_HTTPS_CALLBACK_PATH = "/auth/app-callback";

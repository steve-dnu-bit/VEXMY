import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import {
  APPLE_SIGN_IN_ENABLED,
  AUTH_SITE_ORIGIN,
  GOOGLE_SIGN_IN_ENABLED,
  NATIVE_OAUTH_HTTPS_CALLBACK_PATH,
} from "@/lib/authConfig";
import { stashAuthIntent, type AuthIntent } from "@/lib/authIntent";
import { completeStashedAuthProvisioning } from "@/lib/authProvisioning";
import { isGoogleIdentitySignInAvailable, triggerGoogleSignIn } from "@/lib/googleIdentity";
import { isNativeApp, isNativeAppShell } from "@/lib/platform";

export type OAuthProvider = "google" | "apple";

/** Production site origin — always velbok.com in the native app (never https://localhost). */
export function getAuthSiteOrigin(): string {
  if (isNativeApp()) return AUTH_SITE_ORIGIN;
  if (typeof window !== "undefined") {
    const origin = window.location.origin.replace(/\/$/, "");
    if (!/localhost|127\.0\.0\.1/i.test(origin)) return origin;
  }
  return AUTH_SITE_ORIGIN;
}

/**
 * Email confirm / recovery / magic-link redirect.
 * Native must use HTTPS `/auth/app-callback` (not the custom scheme directly).
 * iOS strips `#access_token=…` from `com.velbok.app://…` links, which caused
 * "Sign-in callback did not include session tokens". The HTTPS page copies
 * hash/query into the custom-scheme query string before opening the app.
 */
export function emailAuthRedirectUrl(path = "/auth"): string {
  if (isNativeApp()) {
    const base = `${getAuthSiteOrigin()}${NATIVE_OAUTH_HTTPS_CALLBACK_PATH}`;
    if (path.includes("mode=recovery")) {
      return `${base}?mode=recovery`;
    }
    return base;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getAuthSiteOrigin()}${normalized}`;
}

/**
 * Where Supabase OAuth redirects after provider sign-in.
 * Native: HTTPS passthrough on velbok.com → deep link (PKCE verifier stays in the app WebView).
 */
function oauthRedirectUrl(): string {
  if (isNativeApp()) return `${getAuthSiteOrigin()}${NATIVE_OAUTH_HTTPS_CALLBACK_PATH}`;
  return `${getAuthSiteOrigin()}/auth`;
}

export function buildWebOAuthRedirectUrl(path: string, intent: AuthIntent): string {
  stashAuthIntent(intent);
  const base = `${getAuthSiteOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
  const url = new URL(base);
  url.searchParams.set("auth_intent", intent.type);
  if (intent.organizationId) url.searchParams.set("org", intent.organizationId);
  if (intent.inviteToken) url.searchParams.set("invite", intent.inviteToken);
  if (intent.next) url.searchParams.set("next", intent.next);
  return url.toString();
}

export function isOAuthProviderEnabled(provider: OAuthProvider): boolean {
  if (provider === "google") return GOOGLE_SIGN_IN_ENABLED;
  return APPLE_SIGN_IN_ENABLED;
}

export function shouldOfferAppleSignIn(): boolean {
  return APPLE_SIGN_IN_ENABLED;
}

export function prefersGoogleIdentitySignIn(): boolean {
  return isGoogleIdentitySignInAvailable();
}

export async function signInWithGoogleIdToken(
  intent: AuthIntent,
  idToken: string,
  rawNonce?: string,
): Promise<void> {
  stashAuthIntent(intent);

  const withNonce = rawNonce
    ? await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
        nonce: rawNonce,
      })
    : null;

  if (withNonce && !withNonce.error) {
    await completeStashedAuthProvisioning();
    return;
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });
  if (error) {
    const hint =
      isNativeAppShell() && /nonce|invalid/i.test(error.message)
        ? " Enable “Skip nonce check” for Google in Supabase Auth, or contact support."
        : "";
    throw new Error(`${error.message}${hint}`);
  }
  await completeStashedAuthProvisioning();
}

async function signInWithSupabaseOAuth(provider: OAuthProvider, intent: AuthIntent): Promise<void> {
  stashAuthIntent(intent);

  const native = isNativeApp();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: oauthRedirectUrl(),
      skipBrowserRedirect: native,
      queryParams:
        provider === "google"
          ? { prompt: "select_account", hl: "en", ui_locales: "en" }
          : { scope: "name email" },
    },
  });

  if (error) throw error;
  if (!native) return;

  if (!data?.url) throw new Error("OAuth URL was not returned.");
  await Browser.open({ url: data.url });
}

/**
 * Google sign-in:
 * - Web: Google Identity Services (VITE_GOOGLE_CLIENT_ID) → signInWithIdToken
 * - Native app: Supabase OAuth in Custom Tab → HTTPS passthrough → deep link → PKCE in WebView
 *   (GIS popups do not work reliably in the Capacitor WebView.)
 */
export async function startGoogleSignIn(intent: AuthIntent): Promise<void> {
  if (!GOOGLE_SIGN_IN_ENABLED) {
    throw new Error("google sign-in is not enabled");
  }

  stashAuthIntent(intent);

  if (!isNativeAppShell() && isGoogleIdentitySignInAvailable()) {
    await triggerGoogleSignIn(async (credential, rawNonce) => {
      await signInWithGoogleIdToken(intent, credential, rawNonce);
    });
    return;
  }

  await signInWithSupabaseOAuth("google", intent);
}

export async function startOAuthSignIn(provider: OAuthProvider, intent: AuthIntent): Promise<void> {
  if (!isOAuthProviderEnabled(provider)) {
    throw new Error(`${provider} sign-in is not enabled`);
  }

  if (provider === "google") {
    await startGoogleSignIn(intent);
    return;
  }

  await signInWithSupabaseOAuth(provider, intent);
}

function parseCallbackParams(url: string): URLSearchParams {
  const merged = new URLSearchParams();
  try {
    const parsed = new URL(url.replace(/^com\.velbok\.app:\/\//, "https://com.velbok.app/"));
    if (parsed.search.length > 1) {
      new URLSearchParams(parsed.search.slice(1)).forEach((value, key) => merged.set(key, value));
    }
    if (parsed.hash.length > 1) {
      new URLSearchParams(parsed.hash.slice(1)).forEach((value, key) => merged.set(key, value));
    }
    if ([...merged.keys()].length > 0) return merged;
  } catch {
    /* fall through */
  }
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  if (queryIndex >= 0) {
    const end = hashIndex >= 0 && hashIndex > queryIndex ? hashIndex : url.length;
    new URLSearchParams(url.slice(queryIndex + 1, end)).forEach((value, key) => merged.set(key, value));
  }
  if (hashIndex >= 0) {
    new URLSearchParams(url.slice(hashIndex + 1)).forEach((value, key) => merged.set(key, value));
  }
  return merged;
}

/**
 * Consumed-callback memory. Success reloads the WebView (window.location.replace),
 * and Capacitor's getLaunchUrl still returns the same deep link afterwards — without
 * persistence the app re-runs the used code/token_hash and toasts a bogus error.
 */
const CONSUMED_CALLBACKS_KEY = "velbok-consumed-auth-callbacks";

function callbackConsumedKey(url: string): string | null {
  const params = parseCallbackParams(url);
  const raw = params.get("code") || params.get("token_hash") || params.get("access_token");
  return raw ? raw.slice(0, 64) : null;
}

function readConsumedCallbacks(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONSUMED_CALLBACKS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function wasAuthCallbackConsumed(url: string): boolean {
  const key = callbackConsumedKey(url);
  return !!key && readConsumedCallbacks().includes(key);
}

export function markAuthCallbackConsumed(url: string): void {
  const key = callbackConsumedKey(url);
  if (!key) return;
  try {
    const list = readConsumedCallbacks().filter((k) => k !== key);
    list.push(key);
    localStorage.setItem(CONSUMED_CALLBACKS_KEY, JSON.stringify(list.slice(-10)));
  } catch {
    /* private mode */
  }
}

export function isOAuthCallbackUrl(url: string): boolean {
  // Require real auth payload — bare com.velbok.app://auth/callback (no tokens) must not error.
  return (
    url.includes("access_token=") ||
    url.includes("refresh_token=") ||
    url.includes("code=") ||
    url.includes("token_hash=") ||
    /[?&#]error=/.test(url)
  );
}

async function exchangePkceCode(url: string): Promise<void> {
  const params = parseCallbackParams(url);
  const code = params.get("code");
  if (!code) throw new Error("Sign-in callback did not include an authorization code.");

  // Verifier lives in the app WebView storage — exchange by code first on native.
  const { error: codeOnlyError } = await supabase.auth.exchangeCodeForSession(code);
  if (!codeOnlyError) return;

  const siteOrigin = getAuthSiteOrigin();
  const candidates = [
    url,
    url.replace(/^com\.velbok\.app:\/\//, "https://com.velbok.app/"),
    `${siteOrigin}${NATIVE_OAUTH_HTTPS_CALLBACK_PATH}?code=${encodeURIComponent(code)}`,
    `${siteOrigin}/auth?code=${encodeURIComponent(code)}`,
  ];

  let lastError: Error | null = codeOnlyError;
  for (const candidate of candidates) {
    const { error } = await supabase.auth.exchangeCodeForSession(candidate);
    if (!error) return;
    lastError = error;
  }

  throw lastError ?? new Error("Could not complete sign-in.");
}

export async function establishSessionFromOAuthCallback(url: string): Promise<boolean> {
  if (!isOAuthCallbackUrl(url)) return false;

  const params = parseCallbackParams(url);
  const oauthError = params.get("error_description") || params.get("error");
  if (oauthError) {
    throw new Error(oauthError.replace(/\+/g, " "));
  }

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const otpType = params.get("type");

  if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
    });
    if (error) throw error;
  } else if (code) {
    await exchangePkceCode(url);
  } else {
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) {
      // Truncated deep link (iOS dropped the hash) — ignore instead of toasting forever.
      console.warn("[oauth] callback missing session params:", url.replace(/([?#]).*/, "$1…"));
      return false;
    }
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
  }

  await completeStashedAuthProvisioning();
  return true;
}

export async function handleOAuthCallbackUrl(url: string): Promise<boolean> {
  if (!isOAuthCallbackUrl(url)) return false;
  // Stale launch URL (already exchanged before a reload/cold start) — never re-run it.
  if (wasAuthCallbackConsumed(url)) return false;

  try {
    await Browser.close().catch(() => undefined);
    const established = await establishSessionFromOAuthCallback(url);
    if (!established) return false;
    markAuthCallbackConsumed(url);

    const params = parseCallbackParams(url);
    const isRecovery =
      params.get("mode") === "recovery" || params.get("type") === "recovery";

    if (isNativeAppShell()) {
      window.location.replace(
        `${window.location.origin}${isRecovery ? "/auth?mode=recovery" : "/"}`,
      );
    }

    window.dispatchEvent(new CustomEvent("velbok:oauth-success"));
    return true;
  } catch (e) {
    console.error(
      "[oauth] callback failed:",
      url.replace(/([?#&](?:access_token|refresh_token)=)[^&]+/gi, "$1…"),
      e,
    );
    await Browser.close().catch(() => undefined);

    // Already signed in? Then this was a stale/re-used link — don't scare the user.
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    if (data.session) {
      markAuthCallbackConsumed(url);
      return false;
    }

    const message = e instanceof Error ? e.message : String(e);
    window.dispatchEvent(new CustomEvent("velbok:oauth-error", { detail: message }));
    throw e;
  }
}

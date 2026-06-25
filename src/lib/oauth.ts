import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import {
  APPLE_SIGN_IN_ENABLED,
  GOOGLE_SIGN_IN_ENABLED,
  NATIVE_OAUTH_REDIRECT_URL,
} from "@/lib/authConfig";
import { stashAuthIntent, type AuthIntent } from "@/lib/authIntent";
import { completeStashedAuthProvisioning } from "@/lib/authProvisioning";
import { isGoogleIdentitySignInAvailable } from "@/lib/googleIdentity";
import { isNativeApp } from "@/lib/platform";

export type OAuthProvider = "google" | "apple";

export function getAuthSiteOrigin(): string {
  const fromEnv =
    import.meta.env.VITE_SITE_URL?.trim() || import.meta.env.VITE_SHOP_WEBSITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "https://velbok.com";
}

function appendIntentToUrl(baseUrl: string, intent: AuthIntent): string {
  const url = new URL(baseUrl);
  url.searchParams.set("auth_intent", intent.type);
  if (intent.organizationId) url.searchParams.set("org", intent.organizationId);
  if (intent.inviteToken) url.searchParams.set("invite", intent.inviteToken);
  if (intent.next) url.searchParams.set("next", intent.next);
  return url.toString();
}

export function buildWebOAuthRedirectUrl(path: string, intent: AuthIntent): string {
  stashAuthIntent(intent);
  const base = `${getAuthSiteOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
  return appendIntentToUrl(base, intent);
}

export function isOAuthProviderEnabled(provider: OAuthProvider): boolean {
  if (provider === "google") return GOOGLE_SIGN_IN_ENABLED;
  return APPLE_SIGN_IN_ENABLED;
}

/** Show Sign in with Apple when enabled via env (configure Supabase Apple provider first). */
export function shouldOfferAppleSignIn(): boolean {
  return APPLE_SIGN_IN_ENABLED;
}

/** Web + native: Google Identity Services (Velbok picker). Fallback: Supabase redirect OAuth. */
export function prefersGoogleIdentitySignIn(): boolean {
  return isGoogleIdentitySignInAvailable();
}

export async function signInWithGoogleIdToken(intent: AuthIntent, idToken: string): Promise<void> {
  stashAuthIntent(intent);
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });
  if (error) throw error;
  await completeStashedAuthProvisioning();
}

export async function startOAuthSignIn(provider: OAuthProvider, intent: AuthIntent): Promise<void> {
  if (!isOAuthProviderEnabled(provider)) {
    throw new Error(`${provider} sign-in is not enabled`);
  }

  stashAuthIntent(intent);

  const redirectPath = (() => {
    if (intent.type === "studio_subscribe") {
      return `/subscribe?plan=${encodeURIComponent(intent.planId || "studio")}`;
    }
    if (intent.type === "customer") {
      // Shop website links open /auth — return there so AuthHomeRedirect can finish the flow.
      if (
        typeof window !== "undefined" &&
        window.location.pathname.startsWith("/embed/customer-login")
      ) {
        return "/embed/customer-login";
      }
      return "/auth";
    }
    return "/auth";
  })();

  const redirectTo = isNativeApp()
    ? NATIVE_OAUTH_REDIRECT_URL
    : buildWebOAuthRedirectUrl(redirectPath, intent);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: isNativeApp(),
      queryParams:
        provider === "apple"
          ? { scope: "name email" }
          : undefined,
    },
  });

  if (error) throw error;

  if (isNativeApp()) {
    if (!data?.url) throw new Error("OAuth URL missing");
    await Browser.open({ url: data.url, presentationStyle: "popover" });
  }
}

const OAUTH_CALLBACK_PREFIX = "auth/callback";

export function isOAuthCallbackUrl(url: string): boolean {
  return url.includes(OAUTH_CALLBACK_PREFIX) || url.includes("access_token=") || url.includes("code=");
}

export async function handleOAuthCallbackUrl(url: string): Promise<boolean> {
  if (!isOAuthCallbackUrl(url)) return false;

  try {
    if (url.includes("code=")) {
      const { error } = await supabase.auth.exchangeCodeForSession(url);
      if (error) throw error;
    } else if (url.includes("access_token=") || url.includes("#")) {
      const { error } = await supabase.auth.getSession();
      if (error) throw error;
    }

    await Browser.close().catch(() => undefined);
    await completeStashedAuthProvisioning();
    return true;
  } catch (e) {
    console.error("[oauth] callback failed:", e);
    await Browser.close().catch(() => undefined);
    throw e;
  }
}

let nativeOAuthListenerRegistered = false;

/** Register Capacitor deep-link handler for native OAuth return URLs. */
export function registerNativeOAuthListener(): void {
  if (!isNativeApp() || nativeOAuthListenerRegistered) return;
  nativeOAuthListenerRegistered = true;

  void App.addListener("appUrlOpen", (event) => {
    void handleOAuthCallbackUrl(event.url).catch(() => undefined);
  });

  void App.getLaunchUrl().then((launch) => {
    if (launch?.url) {
      void handleOAuthCallbackUrl(launch.url).catch(() => undefined);
    }
  });
}

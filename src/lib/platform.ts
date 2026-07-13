import { Capacitor } from "@capacitor/core";

/** True when running inside the Capacitor native shell (Android/iOS app). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** True in the Capacitor WebView, not a Custom Tab on velbok.com. */
export function isNativeAppShell(): boolean {
  if (!isNativeApp()) return false;
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  if (host === "velbok.com" || host === "www.velbok.com") return false;
  return true;
}

export function nativePlatform(): "android" | "ios" | "web" {
  const platform = Capacitor.getPlatform();
  if (platform === "android" || platform === "ios") return platform;
  return "web";
}

/** iPad (including iPadOS desktop UA). */
export function isIpadDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Stripe Terminal simulated readers require test-mode secret keys. */
export function stripeTerminalIsTestMode(): boolean {
  const flag = import.meta.env.VITE_STRIPE_TERMINAL_TEST_MODE;
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  // Production mobile builds use live Connect keys — never default to test mode.
  if (isNativeApp()) return false;
  return import.meta.env.DEV;
}

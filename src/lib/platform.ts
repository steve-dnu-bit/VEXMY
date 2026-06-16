import { Capacitor } from "@capacitor/core";

/** True when running inside the Capacitor native shell (Android/iOS app). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): "android" | "ios" | "web" {
  const platform = Capacitor.getPlatform();
  if (platform === "android" || platform === "ios") return platform;
  return "web";
}

/** Stripe Terminal simulated readers require test-mode secret keys. */
export function stripeTerminalIsTestMode(): boolean {
  const flag = import.meta.env.VITE_STRIPE_TERMINAL_TEST_MODE;
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return import.meta.env.DEV;
}

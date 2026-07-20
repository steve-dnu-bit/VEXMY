import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { StripeTerminal } from "@capacitor-community/stripe-terminal";
import { isIpadDevice, nativePlatform, stripeTerminalIsTestMode } from "@/lib/platform";
import { warmIosLocationForPos } from "@/lib/terminal/iosTerminalPermissions";
import { isNativeTerminalInitialized, setNativeTerminalInitialized } from "@/lib/terminal/nativeTerminalState";

let warmUpListenerRegistered = false;
let warmUpInFlight: Promise<void> | null = null;

async function resolveIsTestBestEffort(): Promise<boolean> {
  try {
    const { fetchTerminalConfig } = await import("@/lib/terminal/fetchTerminalConfig");
    const config = await fetchTerminalConfig();
    return config.isTest;
  } catch {
    return stripeTerminalIsTestMode();
  }
}

/**
 * Apple TTPOI 1.5 — prepare Stripe Terminal early on iPhone launch/foreground.
 * Best-effort: never throws into UI; skips iPad and devices without location yet.
 */
export async function warmTapToPayOnIphone(): Promise<void> {
  if (nativePlatform() !== "ios" || isIpadDevice()) return;
  if (!Capacitor.isPluginAvailable("StripeTerminal")) return;
  if (isNativeTerminalInitialized()) return;

  if (warmUpInFlight) {
    await warmUpInFlight;
    return;
  }

  warmUpInFlight = (async () => {
    try {
      const { ensureNativeTerminalTokenListener } = await import("@/lib/terminal/nativeTerminalProvider");
      await ensureNativeTerminalTokenListener();

      const location = await warmIosLocationForPos();
      if (location !== "granted") return;
      if (isNativeTerminalInitialized()) return;

      const isTest = await resolveIsTestBestEffort();
      await StripeTerminal.initialize({ isTest });
      setNativeTerminalInitialized(true);
    } catch (error) {
      console.warn("[velbok] Tap to Pay warm-up skipped:", error);
    } finally {
      warmUpInFlight = null;
    }
  })();

  await warmUpInFlight;
}

/** Register once: warm on start + whenever the app returns to foreground. */
export async function registerTapToPayWarmUpListeners(): Promise<void> {
  if (nativePlatform() !== "ios" || isIpadDevice()) return;
  if (warmUpListenerRegistered) return;
  warmUpListenerRegistered = true;

  void warmTapToPayOnIphone();

  await App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) void warmTapToPayOnIphone();
  });
}

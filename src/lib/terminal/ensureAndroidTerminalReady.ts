import { StripeTerminal } from "@capacitor-community/stripe-terminal";
import { nativePlatform } from "@/lib/platform";
import { ensureIosReaderPermissions } from "@/lib/terminal/iosTerminalPermissions";
import type { TerminalReaderMode } from "@/lib/terminal/types";

const INIT_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

async function ensureAndroidLocationViaStripePlugin(): Promise<void> {
  const plugin = StripeTerminal as unknown as {
    checkPermissions?: () => Promise<{ location?: string }>;
    requestPermissions?: () => Promise<{ location?: string }>;
  };

  if (typeof plugin.checkPermissions !== "function") return;

  let state = await plugin.checkPermissions().catch(() => ({ location: "prompt" as const }));
  if (state.location === "granted") return;

  if (typeof plugin.requestPermissions === "function") {
    state = await plugin.requestPermissions().catch(() => ({ location: "denied" as const }));
  }

  if (state.location !== "granted") {
    throw new Error(
      "Location permission is required for card reader payments. Open Android Settings → Apps → Velbok → Permissions → Location → Allow, then try again.",
    );
  }
}

/** Stripe Terminal requires location + Bluetooth on native for reader discovery. */
export async function ensureNativeTerminalLocationPermission(
  readerMode: TerminalReaderMode = "bluetooth",
): Promise<void> {
  const platform = nativePlatform();
  if (platform === "ios") {
    await ensureIosReaderPermissions(readerMode);
    return;
  }
  if (platform === "android") {
    await ensureAndroidLocationViaStripePlugin();
  }
}

/** @deprecated Use ensureNativeTerminalLocationPermission */
export const ensureAndroidTerminalLocationPermission = ensureNativeTerminalLocationPermission;

export async function initializeStripeTerminalWithTimeout(
  isTest: boolean,
  readerMode: TerminalReaderMode = "bluetooth",
): Promise<void> {
  await ensureNativeTerminalLocationPermission(readerMode);
  await withTimeout(
    StripeTerminal.initialize({ isTest }),
    INIT_TIMEOUT_MS,
    "Phone payments did not start in time. Allow Location for Velbok, check internet, then try again.",
  );
}

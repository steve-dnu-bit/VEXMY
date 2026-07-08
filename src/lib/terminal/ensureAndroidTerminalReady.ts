import { StripeTerminal } from "@capacitor-community/stripe-terminal";
import { nativePlatform } from "@/lib/platform";
import { TerminalPermissions } from "@/lib/terminal/terminalNativePermissions";

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

async function ensureIosTerminalReaderPermissions(): Promise<void> {
  const state = await TerminalPermissions.requestReaderPermissions().catch(() => ({
    location: "denied" as const,
    bluetooth: "denied" as const,
  }));

  if (state.location !== "granted") {
    throw new Error(
      "Location permission is required for card reader payments. Open iPhone Settings → Velbok → Location → While Using the App, then try again.",
    );
  }

  if (state.bluetooth === "denied") {
    throw new Error(
      "Bluetooth permission is required to connect your WisePad reader. Open iPhone Settings → Velbok → Bluetooth → Allow, then try again.",
    );
  }
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
export async function ensureNativeTerminalLocationPermission(): Promise<void> {
  const platform = nativePlatform();
  if (platform === "ios") {
    await ensureIosTerminalReaderPermissions();
    return;
  }
  if (platform === "android") {
    await ensureAndroidLocationViaStripePlugin();
  }
}

/** @deprecated Use ensureNativeTerminalLocationPermission */
export const ensureAndroidTerminalLocationPermission = ensureNativeTerminalLocationPermission;

export async function initializeStripeTerminalWithTimeout(isTest: boolean): Promise<void> {
  await ensureNativeTerminalLocationPermission();
  await withTimeout(
    StripeTerminal.initialize({ isTest }),
    INIT_TIMEOUT_MS,
    "Phone payments did not start in time. Allow Location for Velbok, check internet, then try again.",
  );
}

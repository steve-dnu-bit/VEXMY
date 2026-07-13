import { StripeTerminal } from "@capacitor-community/stripe-terminal";
import { registerPlugin } from "@capacitor/core";
import { nativePlatform } from "@/lib/platform";
import { ensureIosReaderPermissions } from "@/lib/terminal/iosTerminalPermissions";
import type { TerminalReaderMode } from "@/lib/terminal/types";

const INIT_TIMEOUT_MS = 45_000;

interface TerminalReadinessPlugin {
  checkEnvironment(): Promise<{
    locationGranted?: boolean;
    locationServicesEnabled?: boolean;
  }>;
  openAppSettings(): Promise<void>;
}

const TerminalReadiness = registerPlugin<TerminalReadinessPlugin>("TapToPayReadiness", {
  web: {
    checkEnvironment: async () => ({ locationGranted: true, locationServicesEnabled: true }),
    openAppSettings: async () => undefined,
  },
});

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

async function openVelbokAppSettings(): Promise<void> {
  try {
    await TerminalReadiness.openAppSettings();
  } catch {
    // Best-effort — error message still tells the user where to go.
  }
}

/** Android BLE (WisePad) + Tap to Pay require location permission and Location services ON. */
async function ensureAndroidLocationViaStripePlugin(): Promise<void> {
  const env = await TerminalReadiness.checkEnvironment().catch(() => null);
  if (env?.locationServicesEnabled === false) {
    throw new Error(
      "Location (GPS) is turned off. Open Android Settings → Location and turn it ON, then try WisePad again.",
    );
  }

  const plugin = StripeTerminal as unknown as {
    checkPermissions?: () => Promise<{ location?: string }>;
    requestPermissions?: () => Promise<{ location?: string }>;
  };

  if (typeof plugin.checkPermissions !== "function") {
    if (env?.locationGranted === false) {
      await openVelbokAppSettings();
      throw new Error(
        "Location permission is required for WisePad. Open Android Settings → Apps → Velbok → Permissions → Location → Allow, then try again.",
      );
    }
    return;
  }

  let state = await plugin.checkPermissions().catch(() => ({ location: "prompt" as const }));
  if (state.location === "granted") return;

  if (typeof plugin.requestPermissions === "function") {
    state = await plugin.requestPermissions().catch(() => ({ location: "denied" as const }));
  }

  if (state.location !== "granted") {
    await openVelbokAppSettings();
    throw new Error(
      "Location permission is required for WisePad / phone payments. Open Android Settings → Apps → Velbok → Permissions → Location → Allow (and Nearby devices), then try again. If you use Samsung Dual App / Secure Folder, grant permissions on that copy of Velbok too.",
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

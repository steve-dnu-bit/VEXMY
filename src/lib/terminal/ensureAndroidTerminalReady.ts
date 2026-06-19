import { StripeTerminal } from "@capacitor-community/stripe-terminal";
import { nativePlatform } from "@/lib/platform";

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

/** Android Tap to Pay requires location; a denied permission leaves initialize() hanging forever in the plugin. */
export async function ensureAndroidTerminalLocationPermission(): Promise<void> {
  if (nativePlatform() !== "android") return;

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
      "Location permission is required for phone payments. Open Android Settings → Apps → Velbok → Permissions → Location → Allow, then try again.",
    );
  }
}

export async function initializeStripeTerminalWithTimeout(isTest: boolean): Promise<void> {
  await ensureAndroidTerminalLocationPermission();
  await withTimeout(
    StripeTerminal.initialize({ isTest }),
    INIT_TIMEOUT_MS,
    "Phone payments did not start in time. Allow Location for Velbok, check internet, then try again.",
  );
}

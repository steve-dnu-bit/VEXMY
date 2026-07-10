import { registerPlugin } from "@capacitor/core";
import { nativePlatform } from "@/lib/platform";

export interface TapToPayEnvironment {
  ready: boolean;
  debugBuild: boolean;
  /** Android sensor — may read ON even when user turned dev options off. Stripe decides for real. */
  developerOptionsEnabled: boolean;
  usbDebuggingEnabled: boolean;
  hasNfc?: boolean;
  /** Stripe SDK 5+ requires FEATURE_HARDWARE_KEYSTORE v100+ (ECDH). Galaxy S21 fails. */
  hardwareKeystoreEcdh?: boolean;
  androidSdk?: number;
  android13OrLater?: boolean;
  locationGranted?: boolean;
  googlePlayServicesOk?: boolean;
  deviceManufacturer?: string;
  deviceModel?: string;
  stripeListWarning?: boolean;
  versionName?: string;
  versionCode?: number;
  /** iOS: Apple Tap to Pay on iPhone entitlement in signed build */
  tapToPayEntitlementGranted?: boolean;
  isPad?: boolean;
}

interface TapToPayReadinessPlugin {
  checkEnvironment(): Promise<TapToPayEnvironment>;
}

const TapToPayReadiness = registerPlugin<TapToPayReadinessPlugin>("TapToPayReadiness", {
  web: {
    checkEnvironment: async () => ({
      ready: true,
      debugBuild: false,
      developerOptionsEnabled: false,
      usbDebuggingEnabled: false,
    }),
  },
});

export async function checkTapToPayEnvironment(): Promise<TapToPayEnvironment | null> {
  const platform = nativePlatform();
  if (platform !== "android" && platform !== "ios") return null;
  try {
    return await TapToPayReadiness.checkEnvironment();
  } catch {
    return null;
  }
}

/** Blockers Velbok can verify before calling Stripe. */
export function describeTapToPayBlockers(env: TapToPayEnvironment): string[] {
  const blockers: string[] = [];

  if (env.isPad) {
    blockers.push("Tap to Pay is not available on iPad. Switch to WisePad (Bluetooth reader) in reader mode.");
  }
  if (env.tapToPayEntitlementGranted === false) {
    blockers.push(
      "This iPhone build is missing Apple's Tap to Pay entitlement. Enable com.apple.developer.proximity-reader.payment.acceptance on the App ID, regenerate a development provisioning profile that includes your test device, then install a new release build.",
    );
  }

  if (env.debugBuild) {
    blockers.push(
      nativePlatform() === "ios"
        ? "Tap to Pay requires a Release build (development profile on a registered test device is OK) — not an Xcode Debug run."
        : "This Velbok install is debuggable (not a release build). Uninstall Velbok, then install velbok-release.apk only.",
    );
  }
  if (env.android13OrLater === false) {
    blockers.push("Android 13 or later is required for Tap to Pay on Android.");
  }
  if (env.hasNfc === false) {
    blockers.push("This phone has no NFC — Tap to Pay cannot work. Use a WisePad reader instead.");
  }
  if (env.hardwareKeystoreEcdh === false) {
    const device = `${env.deviceManufacturer ?? ""} ${env.deviceModel ?? ""}`.trim() || "This phone";
    blockers.push(
      `${device} does not meet Stripe's Tap to Pay security hardware (keystore ECDH). Galaxy S21/S20 and many older phones are excluded — use a Galaxy S22+ / Pixel 6+ phone, or WisePad Bluetooth mode above.`,
    );
  }
  if (env.locationGranted === false) {
    blockers.push(
      nativePlatform() === "ios"
        ? "Location permission is required. Settings → Privacy & Security → Location Services (ON), then Settings → Velbok → Location → While Using the App with Precise Location ON."
        : "Location permission is required. Settings → Apps → Velbok → Permissions → Location → Allow.",
    );
  }
  if (env.googlePlayServicesOk === false) {
    blockers.push(
      "Google Play Services is missing or outdated. Update it in the Play Store, then restart Velbok.",
    );
  }
  if (env.stripeListWarning) {
    blockers.push(
      `${env.deviceManufacturer} ${env.deviceModel}: not on Stripe's published Tap to Pay device list (Galaxy S22+ listed). If Enable still fails, use a WisePad or newer phone.`,
    );
  }

  return blockers;
}

export function describeTapToPayWarnings(env: TapToPayEnvironment): string[] {
  const warnings: string[] = [];
  if (env.developerOptionsEnabled) {
    warnings.push(
      "Android reports Developer options may still be on. If Tap to Pay fails, turn it OFF at the top of Settings → Developer options and restart — but Velbok will not block you based on this sensor alone.",
    );
  }
  if (env.usbDebuggingEnabled) {
    warnings.push("USB debugging appears enabled. Turn it off if Stripe reports an insecure environment.");
  }
  return warnings;
}

/** Hard blockers only — device list and dev-options sensors are warnings. */
export function hasTapToPayHardBlockers(env: TapToPayEnvironment): boolean {
  if (env.isPad) return true;
  if (env.tapToPayEntitlementGranted === false) return true;
  return (
    env.debugBuild ||
    env.android13OrLater === false ||
    env.hasNfc === false ||
    env.hardwareKeystoreEcdh === false ||
    env.locationGranted === false ||
    env.googlePlayServicesOk === false
  );
}

export function formatTapToPayBlockersMessage(env: TapToPayEnvironment): string | null {
  const hard = describeTapToPayBlockers(env).filter((line) => !line.includes("published Tap to Pay device list"));
  if (hard.length === 0) return null;
  return hard.join(" ");
}

export async function assertTapToPayEnvironmentReady(): Promise<void> {
  const env = await checkTapToPayEnvironment();
  if (!env) return;
  const message = formatTapToPayBlockersMessage(env);
  if (message) throw new Error(message);
}

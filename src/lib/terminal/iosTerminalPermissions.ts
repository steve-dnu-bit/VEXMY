import { Capacitor } from "@capacitor/core";
import { TerminalPermissions } from "@/lib/terminal/terminalNativePermissions";
import type { TerminalReaderMode } from "@/lib/terminal/types";

export type PermissionOutcome = "granted" | "denied" | "prompt" | "restricted" | "disabled";

function pluginMissingError(): Error {
  return new Error(
    "TerminalPermissions is missing from this iOS build. On your Mac run npm run ios:prepare, then create a new Xcode archive — do not upload a build made after ios:build-lite.",
  );
}

function mapState(value: string | undefined): PermissionOutcome {
  if (
    value === "granted" ||
    value === "denied" ||
    value === "prompt" ||
    value === "restricted" ||
    value === "disabled"
  ) {
    return value;
  }
  return "prompt";
}

function asError(err: unknown, fallback: string): Error {
  if (err instanceof Error && err.message.trim()) return err;
  if (typeof err === "string" && err.trim()) return new Error(err);
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    const message = (err as { message: string }).message.trim();
    if (message) return new Error(message);
  }
  return new Error(fallback);
}

/**
 * Stripe Terminal iOS: request When-In-Use via native CLLocationManager and keep
 * GPS updates running so Stripe can read the device location.
 *
 * Note: iOS only shows the Allow dialog when status is still "Ask Next Time"
 * (notDetermined). If Settings already shows Location On, no dialog will appear —
 * that is normal. We still start location updates for Stripe.
 */
export async function ensureIosReaderPermissions(readerMode: TerminalReaderMode = "bluetooth"): Promise<void> {
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) {
    throw pluginMissingError();
  }

  try {
    await TerminalPermissions.requestLocationPermission();
  } catch (err) {
    throw asError(
      err,
      "Location permission is required for card reader payments. Open Settings → Privacy & Security → Location Services (ON), then Settings → Velbok → Location → While Using the App.",
    );
  }

  if (readerMode === "bluetooth") {
    try {
      await TerminalPermissions.requestBluetoothPermission();
    } catch (err) {
      throw asError(
        err,
        "Bluetooth permission is required to connect your WisePad reader. Open Settings → Velbok → Bluetooth → Allow, then try again.",
      );
    }
  }
}

/**
 * Call once when POS opens. If status is still notDetermined, this triggers the
 * system Allow Location dialog. If already granted/denied, no dialog (iOS rule).
 */
export async function warmIosLocationForPos(): Promise<PermissionOutcome> {
  if (Capacitor.getPlatform() !== "ios") return "granted";
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) return "prompt";

  try {
    const current = await TerminalPermissions.checkLocationPermission();
    const state = mapState(current.location);
    if (state === "prompt") {
      await TerminalPermissions.requestLocationPermission();
      const after = await TerminalPermissions.checkLocationPermission();
      return mapState(after.location);
    }
    if (state === "granted") {
      // Re-enter request path so native plugin starts continuous GPS updates.
      await TerminalPermissions.requestLocationPermission().catch(() => undefined);
    }
    return state;
  } catch {
    return "disabled";
  }
}

export async function checkIosLocationPermission(): Promise<PermissionOutcome> {
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) return "prompt";
  try {
    const state = await TerminalPermissions.checkLocationPermission();
    return mapState(state.location);
  } catch {
    return "disabled";
  }
}

export async function checkIosBluetoothPermission(): Promise<PermissionOutcome> {
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) return "prompt";
  try {
    const state = await TerminalPermissions.checkBluetoothPermission();
    return mapState(state.bluetooth);
  } catch {
    return "prompt";
  }
}

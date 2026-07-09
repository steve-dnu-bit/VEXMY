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

/**
 * Stripe Terminal iOS: request When-In-Use location via native CLLocationManager
 * (main thread), warm a GPS fix, then request Bluetooth for WisePad.
 *
 * Do NOT use Capacitor Geolocation for this gate — it throws when system Location
 * Services are off and our previous code mapped that to a misleading "permission denied"
 * Settings toast even when Velbok's Location toggle was already On.
 */
function asError(err: unknown, fallback: string): Error {
  if (err instanceof Error && err.message.trim()) return err;
  if (typeof err === "string" && err.trim()) return new Error(err);
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    const message = (err as { message: string }).message.trim();
    if (message) return new Error(message);
  }
  return new Error(fallback);
}

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

export async function checkIosLocationPermission(): Promise<PermissionOutcome> {
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) return "prompt";
  try {
    const state = await TerminalPermissions.checkLocationPermission();
    return mapState(state.location);
  } catch {
    // checkPermissions throws when Location Services are globally off in some stacks;
    // our native plugin returns location: "disabled" instead, but keep a safe fallback.
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

import { Capacitor } from "@capacitor/core";
import { TerminalPermissions } from "@/lib/terminal/terminalNativePermissions";

export type PermissionOutcome = "granted" | "denied" | "prompt" | "restricted" | "disabled";

function pluginMissingError(): Error {
  return new Error(
    "Terminal permissions are missing from this iOS build. On your Mac run npm run ios:prepare, then create a new Xcode archive — do not upload a build made after ios:build-lite.",
  );
}

function normalizeLocation(value: string | undefined): PermissionOutcome {
  if (value === "granted" || value === "denied" || value === "prompt" || value === "restricted" || value === "disabled") {
    return value;
  }
  return "prompt";
}

function normalizeBluetooth(value: string | undefined): PermissionOutcome {
  if (value === "granted" || value === "denied" || value === "prompt" || value === "restricted") {
    return value;
  }
  return "prompt";
}

/** Stripe Terminal iOS: request Location + Bluetooth on the main thread before SDK calls. */
export async function ensureIosReaderPermissions(): Promise<void> {
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) {
    throw pluginMissingError();
  }

  try {
    const state = await TerminalPermissions.requestReaderPermissions();
    if (state.location !== "granted") {
      throw new Error(
        state.location === "disabled"
          ? "Location Services are turned off on this iPhone. Open Settings → Privacy & Security → Location Services, turn them on, then try again."
          : state.location === "restricted"
            ? "Location access is restricted on this iPhone. Allow Location for Velbok in Settings, then try again."
            : state.location === "denied"
              ? "Location permission is required for card reader payments. Open Settings → Velbok → Location → While Using the App, then try again."
              : "Location permission is required. Tap Connect again and choose Allow when iPhone asks.",
      );
    }
    if (state.bluetooth === "denied" || state.bluetooth === "restricted") {
      throw new Error(
        "Bluetooth permission is required to connect your WisePad reader. Open Settings → Velbok → Bluetooth → Allow, then try again.",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Terminal permissions are missing")) {
      throw error;
    }
    if (error instanceof Error && error.message.length > 0) {
      throw error;
    }
    throw new Error(
      "Could not request Location and Bluetooth permissions. Delete Velbok, reinstall from TestFlight, then tap Connect and choose Allow on each iPhone dialog.",
    );
  }
}

/** @deprecated Use ensureIosReaderPermissions */
export const ensureIosLocationPermission = ensureIosReaderPermissions;

/** @deprecated Use ensureIosReaderPermissions */
export const ensureIosBluetoothPermission = ensureIosReaderPermissions;

export async function checkIosLocationPermission(): Promise<PermissionOutcome> {
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) return "prompt";
  const state = await TerminalPermissions.checkReaderPermissions().catch(() => null);
  return state ? normalizeLocation(state.location) : "prompt";
}

export async function checkIosBluetoothPermission(): Promise<PermissionOutcome> {
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) return "prompt";
  const state = await TerminalPermissions.checkReaderPermissions().catch(() => null);
  return state ? normalizeBluetooth(state.bluetooth) : "prompt";
}

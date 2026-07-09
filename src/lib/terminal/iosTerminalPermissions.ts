import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { TerminalPermissions } from "@/lib/terminal/terminalNativePermissions";
import type { TerminalReaderMode } from "@/lib/terminal/types";

export type PermissionOutcome = "granted" | "denied" | "prompt" | "restricted" | "disabled";

function locationSettingsHint(): string {
  return "Open iPhone Settings → Velbok → Location → While Using the App, then try again.";
}

function bluetoothSettingsHint(): string {
  return "Open iPhone Settings → Velbok → Bluetooth → Allow, then try again.";
}

function locationPromptHint(): string {
  return "Tap Allow when iPhone asks for Location access, then try Connect again.";
}

function bluetoothPromptHint(): string {
  return "Tap Allow when iPhone asks for Bluetooth access, then try Connect again.";
}

function pluginMissingError(name: string): Error {
  return new Error(
    `${name} is missing from this iOS build. On your Mac run npm run ios:prepare, then create a new Xcode archive — do not upload a build made after ios:build-lite.`,
  );
}

function mapGeolocationState(value: string | undefined): PermissionOutcome {
  if (value === "granted" || value === "denied" || value === "prompt") return value;
  return "prompt";
}

async function ensureIosLocationViaGeolocation(): Promise<void> {
  if (!Capacitor.isPluginAvailable("Geolocation")) {
    throw pluginMissingError("Geolocation");
  }

  let state = await Geolocation.checkPermissions().catch(() => ({ location: "prompt" as const }));
  let location = mapGeolocationState(state.location);

  if (location === "granted") {
    await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 60_000,
    }).catch(() => undefined);
    return;
  }

  if (location === "denied") {
    throw new Error(`Location permission is required for card reader payments. ${locationSettingsHint()}`);
  }

  state = await Geolocation.requestPermissions().catch(() => ({ location: "denied" as const }));
  location = mapGeolocationState(state.location);

  if (location === "granted") {
    await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 60_000,
    }).catch(() => undefined);
    return;
  }

  if (location === "denied") {
    throw new Error(`Location permission is required for card reader payments. ${locationSettingsHint()}`);
  }

  // iOS sometimes only shows the dialog on getCurrentPosition after requestPermissions.
  try {
    await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 30_000,
      maximumAge: 0,
    });
    return;
  } catch {
    throw new Error(`Location permission is required for card reader payments. ${locationPromptHint()}`);
  }
}

async function ensureIosBluetoothViaNative(): Promise<void> {
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) {
    throw pluginMissingError("TerminalPermissions");
  }

  const state = await TerminalPermissions.requestBluetoothPermission();
  if (state.bluetooth === "granted" || state.bluetooth === "prompt") {
    return;
  }

  if (state.bluetooth === "denied" || state.bluetooth === "restricted") {
    throw new Error(`Bluetooth permission is required to connect your WisePad reader. ${bluetoothSettingsHint()}`);
  }

  throw new Error(`Bluetooth permission is required to connect your WisePad reader. ${bluetoothPromptHint()}`);
}

/** Stripe Terminal iOS: Location (Geolocation) + Bluetooth (native) before SDK calls. */
export async function ensureIosReaderPermissions(readerMode: TerminalReaderMode = "bluetooth"): Promise<void> {
  await ensureIosLocationViaGeolocation();

  if (readerMode === "bluetooth") {
    await ensureIosBluetoothViaNative();
  }
}

export async function checkIosLocationPermission(): Promise<PermissionOutcome> {
  if (!Capacitor.isPluginAvailable("Geolocation")) return "prompt";
  const state = await Geolocation.checkPermissions().catch(() => ({ location: "prompt" as const }));
  return mapGeolocationState(state.location);
}

export async function checkIosBluetoothPermission(): Promise<PermissionOutcome> {
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) return "prompt";
  const state = await TerminalPermissions.checkBluetoothPermission().catch(() => ({ bluetooth: "prompt" as const }));
  if (state.bluetooth === "granted") return "granted";
  if (state.bluetooth === "denied") return "denied";
  if (state.bluetooth === "restricted") return "restricted";
  return "prompt";
}

import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { TerminalPermissions } from "@/lib/terminal/terminalNativePermissions";

type PermissionOutcome = "granted" | "denied" | "prompt";

function locationSettingsHint(): string {
  return "Open iPhone Settings → Velbok → Location → While Using the App, then try again.";
}

function bluetoothSettingsHint(): string {
  return "Open iPhone Settings → Velbok → Bluetooth → Allow, then try again.";
}

function promptHint(what: "location" | "bluetooth"): string {
  if (what === "location") {
    return "Tap Allow when iPhone asks for Location access, then try Connect again.";
  }
  return "Tap Allow when iPhone asks for Bluetooth access, then try Connect again.";
}

export async function ensureIosLocationPermission(): Promise<void> {
  let state = await Geolocation.checkPermissions().catch(() => ({ location: "prompt" as PermissionOutcome }));

  if (state.location === "granted") return;

  if (state.location === "denied") {
    throw new Error(`Location permission is required for card reader payments. ${locationSettingsHint()}`);
  }

  state = await Geolocation.requestPermissions().catch(() => ({ location: "denied" as PermissionOutcome }));

  if (state.location === "granted") {
    await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10_000 }).catch(() => undefined);
    return;
  }

  if (state.location === "denied") {
    throw new Error(`Location permission is required for card reader payments. ${locationSettingsHint()}`);
  }

  throw new Error(`Location permission is required for card reader payments. ${promptHint("location")}`);
}

export async function ensureIosBluetoothPermission(): Promise<void> {
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) {
    return;
  }

  const state = await TerminalPermissions.requestReaderPermissions();

  if (state.bluetooth === "granted") return;

  if (state.bluetooth === "denied") {
    throw new Error(`Bluetooth permission is required to connect your WisePad reader. ${bluetoothSettingsHint()}`);
  }

  throw new Error(`Bluetooth permission is required to connect your WisePad reader. ${promptHint("bluetooth")}`);
}

export async function checkIosLocationPermission(): Promise<PermissionOutcome> {
  const state = await Geolocation.checkPermissions().catch(() => ({ location: "prompt" as PermissionOutcome }));
  return state.location === "granted" ? "granted" : state.location === "denied" ? "denied" : "prompt";
}

export async function checkIosBluetoothPermission(): Promise<PermissionOutcome> {
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) {
    return "prompt";
  }
  const state = await TerminalPermissions.checkReaderPermissions().catch(() => ({
    bluetooth: "prompt" as PermissionOutcome,
  }));
  return state.bluetooth === "granted" ? "granted" : state.bluetooth === "denied" ? "denied" : "prompt";
}

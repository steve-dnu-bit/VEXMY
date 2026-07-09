import { registerPlugin } from "@capacitor/core";

export type TerminalPermissionState = "granted" | "denied" | "prompt" | "restricted" | "disabled";

export interface TerminalLocationPermission {
  location: TerminalPermissionState;
  servicesEnabled?: boolean;
  accuracy?: "full" | "reduced" | "unknown";
  fixReady?: boolean;
}

export interface TerminalBluetoothPermission {
  bluetooth: TerminalPermissionState;
}

interface TerminalPermissionsPlugin {
  requestLocationPermission(): Promise<TerminalLocationPermission>;
  checkLocationPermission(): Promise<TerminalLocationPermission>;
  requestBluetoothPermission(): Promise<TerminalBluetoothPermission>;
  checkBluetoothPermission(): Promise<TerminalBluetoothPermission>;
  /** @deprecated Prefer requestLocationPermission + requestBluetoothPermission */
  requestReaderPermissions(): Promise<TerminalLocationPermission & TerminalBluetoothPermission>;
  /** @deprecated Prefer checkLocationPermission + checkBluetoothPermission */
  checkReaderPermissions(): Promise<TerminalLocationPermission & TerminalBluetoothPermission>;
}

export const TerminalPermissions = registerPlugin<TerminalPermissionsPlugin>("TerminalPermissions", {
  web: {
    requestLocationPermission: async () => ({
      location: "granted",
      servicesEnabled: true,
      accuracy: "full",
      fixReady: true,
    }),
    checkLocationPermission: async () => ({
      location: "granted",
      servicesEnabled: true,
      accuracy: "full",
      fixReady: true,
    }),
    requestBluetoothPermission: async () => ({ bluetooth: "granted" }),
    checkBluetoothPermission: async () => ({ bluetooth: "granted" }),
    requestReaderPermissions: async () => ({
      location: "granted",
      bluetooth: "granted",
      servicesEnabled: true,
      accuracy: "full",
      fixReady: true,
    }),
    checkReaderPermissions: async () => ({
      location: "granted",
      bluetooth: "granted",
      servicesEnabled: true,
      accuracy: "full",
      fixReady: true,
    }),
  },
});

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

export interface TerminalIosDiagnostics {
  isPad?: boolean;
  model?: string;
  systemVersion?: string;
  buildVersion?: string;
  buildNumber?: string;
  locationServicesEnabled?: boolean;
  authorizationStatus?: string;
  location?: string;
  accuracy?: string;
  hasFix?: boolean;
  horizontalAccuracyMeters?: number;
  updatesStarted?: boolean;
  bluetooth?: string;
  bluetoothManagerState?: number;
  nativeError?: string;
}

interface TerminalPermissionsPlugin {
  requestLocationPermission(): Promise<TerminalLocationPermission>;
  checkLocationPermission(): Promise<TerminalLocationPermission>;
  requestBluetoothPermission(): Promise<TerminalBluetoothPermission>;
  checkBluetoothPermission(): Promise<TerminalBluetoothPermission>;
  getDiagnostics(): Promise<TerminalIosDiagnostics>;
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
    getDiagnostics: async () => ({
      isPad: false,
      locationServicesEnabled: true,
      authorizationStatus: "authorizedWhenInUse",
      location: "granted",
      accuracy: "full",
      hasFix: true,
      updatesStarted: true,
      bluetooth: "granted",
    }),
  },
});

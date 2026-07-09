import { registerPlugin } from "@capacitor/core";

export type TerminalPermissionState = "granted" | "denied" | "prompt" | "restricted";

export interface TerminalBluetoothPermission {
  bluetooth: TerminalPermissionState;
}

interface TerminalPermissionsPlugin {
  requestBluetoothPermission(): Promise<TerminalBluetoothPermission>;
  checkBluetoothPermission(): Promise<TerminalBluetoothPermission>;
  /** @deprecated Use requestBluetoothPermission */
  requestReaderPermissions(): Promise<TerminalBluetoothPermission & { location: string }>;
  /** @deprecated Use checkBluetoothPermission */
  checkReaderPermissions(): Promise<TerminalBluetoothPermission & { location: string }>;
}

export const TerminalPermissions = registerPlugin<TerminalPermissionsPlugin>("TerminalPermissions", {
  web: {
    requestBluetoothPermission: async () => ({ bluetooth: "granted" }),
    checkBluetoothPermission: async () => ({ bluetooth: "granted" }),
    requestReaderPermissions: async () => ({ location: "granted", bluetooth: "granted" }),
    checkReaderPermissions: async () => ({ location: "granted", bluetooth: "granted" }),
  },
});

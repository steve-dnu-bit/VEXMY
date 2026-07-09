import { registerPlugin } from "@capacitor/core";

export type TerminalPermissionState = "granted" | "denied" | "prompt" | "restricted" | "disabled";

export interface TerminalReaderPermissions {
  location: TerminalPermissionState;
  bluetooth: TerminalPermissionState;
  locationServicesEnabled?: boolean;
}

interface TerminalPermissionsPlugin {
  requestReaderPermissions(): Promise<TerminalReaderPermissions>;
  checkReaderPermissions(): Promise<TerminalReaderPermissions>;
}

export const TerminalPermissions = registerPlugin<TerminalPermissionsPlugin>("TerminalPermissions", {
  web: {
    requestReaderPermissions: async () => ({ location: "granted", bluetooth: "granted" }),
    checkReaderPermissions: async () => ({ location: "granted", bluetooth: "granted" }),
  },
});

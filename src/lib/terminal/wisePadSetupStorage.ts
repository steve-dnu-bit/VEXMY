import { useStripeTerminal } from "@/hooks/useStripeTerminal";

export type StripeTerminalHook = ReturnType<typeof useStripeTerminal>;

export const WISEPAD_SETUP_DISMISSED_KEY = "velbok_wisepad_setup_dismissed_v1";
export const WISEPAD_FIRMWARE_DONE_KEY = "velbok_wisepad_firmware_done_v1";

export function hasWisePadFirmwareCompleted(): boolean {
  try {
    return localStorage.getItem(WISEPAD_FIRMWARE_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWisePadFirmwareCompleted(): void {
  try {
    localStorage.setItem(WISEPAD_FIRMWARE_DONE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isWisePadSetupGuideDismissed(): boolean {
  try {
    return localStorage.getItem(WISEPAD_SETUP_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissWisePadSetupGuide(): void {
  try {
    localStorage.setItem(WISEPAD_SETUP_DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

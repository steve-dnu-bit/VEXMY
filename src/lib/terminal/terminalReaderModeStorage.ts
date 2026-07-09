import { nativePlatform, isIpadDevice } from "@/lib/platform";
import type { TerminalReaderMode } from "@/lib/terminal/types";

const STORAGE_KEY = "velbok_terminal_reader_mode_v1";

function defaultReaderMode(): TerminalReaderMode {
  if (isIpadDevice()) return "bluetooth";
  return nativePlatform() === "android" || nativePlatform() === "ios" ? "tap_to_pay" : "bluetooth";
}

/** Tap to Pay is not supported on iPad — always use WisePad there. */
function effectiveReaderMode(mode: TerminalReaderMode): TerminalReaderMode {
  if (isIpadDevice()) return "bluetooth";
  return mode;
}

export function loadTerminalReaderMode(): TerminalReaderMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "tap_to_pay" || value === "bluetooth") {
      return effectiveReaderMode(value);
    }
  } catch {
    /* ignore */
  }
  return defaultReaderMode();
}

export function saveTerminalReaderMode(mode: TerminalReaderMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, effectiveReaderMode(mode));
  } catch {
    /* ignore */
  }
}

export function tapToPaySupportedOnThisDevice(): boolean {
  return !isIpadDevice();
}

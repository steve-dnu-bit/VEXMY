import { nativePlatform, isIpadDevice } from "@/lib/platform";
import type { TerminalReaderMode } from "@/lib/terminal/types";

const STORAGE_KEY = "velbok_terminal_reader_mode_v1";

function defaultReaderMode(): TerminalReaderMode {
  // iPad: WisePad only — no Tap to Pay, no GPS on Wi‑Fi models.
  if (isIpadDevice()) return "bluetooth";
  // iPhone: WisePad until Apple approves Tap to Pay.
  if (nativePlatform() === "ios") return "bluetooth";
  if (nativePlatform() === "android") return "tap_to_pay";
  return "bluetooth";
}

/** Tap to Pay is not supported on iPad; iOS phones use WisePad until Apple approves TTP. */
function effectiveReaderMode(mode: TerminalReaderMode): TerminalReaderMode {
  if (isIpadDevice()) return "bluetooth";
  if (nativePlatform() === "ios" && mode === "tap_to_pay") return "bluetooth";
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

import { nativePlatform } from "@/lib/platform";
import type { TerminalReaderMode } from "@/lib/terminal/types";

const STORAGE_KEY = "velbok_terminal_reader_mode_v1";

function defaultReaderMode(): TerminalReaderMode {
  // iOS: WisePad (Bluetooth) until Apple approves Tap to Pay on iPhone.
  if (nativePlatform() === "ios") return "bluetooth";
  if (nativePlatform() === "android") return "tap_to_pay";
  return "bluetooth";
}

export function loadTerminalReaderMode(): TerminalReaderMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "tap_to_pay" || value === "bluetooth") {
      if (nativePlatform() === "ios" && value === "tap_to_pay") {
        return "bluetooth";
      }
      return value;
    }
  } catch {
    /* ignore */
  }
  return defaultReaderMode();
}

export function saveTerminalReaderMode(mode: TerminalReaderMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

import { nativePlatform } from "@/lib/platform";
import type { TerminalReaderMode } from "@/lib/terminal/types";

const STORAGE_KEY = "velbok_terminal_reader_mode_v1";

function defaultReaderMode(): TerminalReaderMode {
  // Phone-as-terminal (Google Pay / Apple Pay / contactless) is the common mobile path.
  return nativePlatform() === "android" || nativePlatform() === "ios" ? "tap_to_pay" : "bluetooth";
}

export function loadTerminalReaderMode(): TerminalReaderMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "tap_to_pay" || value === "bluetooth") return value;
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

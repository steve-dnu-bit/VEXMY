/** Local flag: merchant completed Tap to Pay enable + education on this device. */
const KEY = "velbok.ttpoi.setupCompleted";

export function hasCompletedTapToPaySetup(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markTapToPaySetupCompleted(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Clear local setup flag (does not reset Apple Business merchant ID). */
export function clearTapToPaySetupCompleted(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

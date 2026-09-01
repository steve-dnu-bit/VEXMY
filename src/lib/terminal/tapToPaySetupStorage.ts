/**
 * Local flag: Apple's How to Tap education has been shown once on this device.
 *
 * This must never gate Apple's Tap to Pay Terms and Conditions. Terms are owned by
 * Apple and raised inside connectReader; only Apple decides whether to show them.
 * The flag exists so a routine reconnect before a sale does not replay the education
 * overlay, and it is only set after a connect succeeded (which means Terms were
 * already accepted).
 */
const KEY = "velbok.ttpoi.educationShown";

export function hasShownTapToPayEducation(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markTapToPayEducationShown(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Clear local flag (does not reset Apple's Terms acceptance for the merchant ID). */
export function clearTapToPayEducationShown(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

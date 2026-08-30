/** Apple Tap to Pay on iPhone button copy — only Velbok app languages (PDF v1.6 table). */
const LONG_FORM: Record<string, string> = {
  en: "Tap to Pay on iPhone",
  de: "Tap to Pay auf dem iPhone",
  fr: "Tap to Pay sur iPhone",
  ro: "Tap to Pay pe iPhone",
  it: "Tap to Pay su iPhone",
  es: "Tap to Pay en iPhone",
  sv: "Tap to Pay på iPhone",
  no: "Tap to Pay på iPhone",
  nl: "Tap to Pay op iPhone",
  bg: "Tap to Pay на iPhone",
};

const SHORT_FORM: Record<string, string> = {
  en: "Tap to Pay",
  de: "Tap to Pay",
  fr: "Tap to Pay",
  ro: "Tap to Pay",
  it: "Tap to Pay",
  es: "Tap to Pay",
  sv: "Tap to Pay",
  no: "Tap to Pay",
  nl: "Tap to Pay",
  bg: "Tap to Pay",
};

function normalizeLang(language: string): string {
  const raw = (language || "en").replace("_", "-");
  if (LONG_FORM[raw]) return raw;
  const base = raw.split("-")[0] || "en";
  return LONG_FORM[base] ? base : "en";
}

/** Long form when Tap to Pay is the only / primary acceptance method on this screen. */
export function tapToPayOnIphoneLabel(language: string): string {
  const key = normalizeLang(language);
  return LONG_FORM[key] || LONG_FORM.en;
}

/** Short form when multiple payment methods are listed. */
export function tapToPayShortLabel(language: string): string {
  const key = normalizeLang(language);
  return SHORT_FORM[key] || SHORT_FORM.en;
}

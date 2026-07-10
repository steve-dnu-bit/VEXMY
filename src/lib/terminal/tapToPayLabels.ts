/** Apple Tap to Pay on iPhone button copy (App Requirements v1.6 localization table). */
const LONG_FORM: Record<string, string> = {
  en: "Tap to Pay on iPhone",
  "en-GB": "Tap to Pay on iPhone",
  "en-US": "Tap to Pay on iPhone",
  da: "Tap to Pay på iPhone",
  de: "Tap to Pay auf dem iPhone",
  nl: "Tap to Pay op iPhone",
  fr: "Tap to Pay sur iPhone",
  "fr-CA": "Paiement rapide sur iPhone",
  it: "Tap to Pay su iPhone",
  nb: "Tap to Pay på iPhone",
  no: "Tap to Pay på iPhone",
  pl: "Tap to Pay na iPhonie",
  pt: "Tap to Pay no iPhone",
  ro: "Tap to Pay pe iPhone",
  sv: "Tap to Pay på iPhone",
  es: "Tap to Pay en iPhone",
};

const SHORT_FORM: Record<string, string> = {
  en: "Tap to Pay",
  "en-GB": "Tap to Pay",
  "en-US": "Tap to Pay",
  da: "Tap to Pay",
  de: "Tap to Pay",
  nl: "Tap to Pay",
  fr: "Tap to Pay",
  it: "Tap to Pay",
  nb: "Tap to Pay",
  no: "Tap to Pay",
  pl: "Tap to Pay",
  pt: "Tap to Pay",
  ro: "Tap to Pay",
  sv: "Tap to Pay",
  es: "Tap to Pay",
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

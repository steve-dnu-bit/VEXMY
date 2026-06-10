/** Stripe-supported shop countries aligned with Velbok app locales (+ US, CA, AU for English). */
export const SHOP_COUNTRIES = [
  { code: "UK", stripeCountry: "GB", currency: "gbp", label: "United Kingdom" },
  { code: "US", stripeCountry: "US", currency: "usd", label: "United States" },
  { code: "CA", stripeCountry: "CA", currency: "cad", label: "Canada" },
  { code: "AU", stripeCountry: "AU", currency: "aud", label: "Australia" },
  { code: "DE", stripeCountry: "DE", currency: "eur", label: "Germany" },
  { code: "FR", stripeCountry: "FR", currency: "eur", label: "France" },
  { code: "RO", stripeCountry: "RO", currency: "ron", label: "Romania" },
  { code: "IT", stripeCountry: "IT", currency: "eur", label: "Italy" },
  { code: "ES", stripeCountry: "ES", currency: "eur", label: "Spain" },
  { code: "SE", stripeCountry: "SE", currency: "sek", label: "Sweden" },
  { code: "NO", stripeCountry: "NO", currency: "nok", label: "Norway" },
  { code: "NL", stripeCountry: "NL", currency: "eur", label: "Netherlands" },
  { code: "BG", stripeCountry: "BG", currency: "bgn", label: "Bulgaria" },
] as const;

export type ShopCountryCode = (typeof SHOP_COUNTRIES)[number]["code"];
export type ShopCurrencyCode = (typeof SHOP_COUNTRIES)[number]["currency"];

const COUNTRY_ALIASES: Record<string, ShopCountryCode> = {
  GB: "UK",
  UK: "UK",
  "UNITED KINGDOM": "UK",
  US: "US",
  USA: "US",
  "UNITED STATES": "US",
  CA: "CA",
  CANADA: "CA",
  AU: "AU",
  AUSTRALIA: "AU",
  DE: "DE",
  GERMANY: "DE",
  DEUTSCHLAND: "DE",
  FR: "FR",
  FRANCE: "FR",
  RO: "RO",
  ROMANIA: "RO",
  ROMÂNIA: "RO",
  IT: "IT",
  ITALY: "IT",
  ITALIA: "IT",
  ES: "ES",
  SPAIN: "ES",
  ESPAÑA: "ES",
  SE: "SE",
  SWEDEN: "SE",
  SVERIGE: "SE",
  NO: "NO",
  NORWAY: "NO",
  NORGE: "NO",
  NL: "NL",
  NETHERLANDS: "NL",
  "THE NETHERLANDS": "NL",
  BG: "BG",
  BULGARIA: "BG",
};

/** Map ISO 3166 country code from IP geo (e.g. GB, US) to a supported shop country. */
export function shopCountryFromGeoCode(iso2: string | null | undefined): ShopCountryCode | null {
  if (!iso2) return null;
  const upper = iso2.trim().toUpperCase();
  const match = SHOP_COUNTRIES.find((c) => c.stripeCountry === upper);
  return match?.code ?? null;
}

export function normalizeShopCountryCode(country: string | null | undefined): ShopCountryCode {
  const raw = (country || "UK").trim().toUpperCase();
  if (raw in COUNTRY_ALIASES) return COUNTRY_ALIASES[raw];
  const byCode = SHOP_COUNTRIES.find((c) => c.code === raw);
  if (byCode) return byCode.code;
  const byStripe = SHOP_COUNTRIES.find((c) => c.stripeCountry === raw);
  if (byStripe) return byStripe.code;
  const byLabel = SHOP_COUNTRIES.find((c) => c.label.toUpperCase() === raw);
  if (byLabel) return byLabel.code;
  return "UK";
}

export function shopCountryByCode(code: ShopCountryCode) {
  return SHOP_COUNTRIES.find((c) => c.code === code)!;
}

export function currencyForShopCountry(country: string | null | undefined): ShopCurrencyCode {
  const code = normalizeShopCountryCode(country);
  return shopCountryByCode(code).currency;
}

export function stripeCountryForShopCountry(country: string | null | undefined): string {
  const code = normalizeShopCountryCode(country);
  return shopCountryByCode(code).stripeCountry;
}

export function isSupportedShopCurrency(value: string | null | undefined): value is ShopCurrencyCode {
  const v = (value || "").toLowerCase();
  return SHOP_COUNTRIES.some((c) => c.currency === v);
}

export function formatShopMoney(amount: number, currency: string): string {
  const code = (currency || "gbp").toUpperCase();
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: code }).format(amount);
  } catch {
    return `${Number(amount).toFixed(2)} ${code}`;
  }
}

/** Stripe minimum charge in major units (not cents). */
export function stripeMinimumChargeMajor(currency: string): number {
  const mins: Record<string, number> = {
    gbp: 0.3,
    usd: 0.5,
    cad: 0.5,
    aud: 0.5,
    eur: 0.5,
    ron: 2.0,
    sek: 3.0,
    nok: 3.0,
    bgn: 1.0,
  };
  return mins[(currency || "gbp").toLowerCase()] ?? 0.5;
}

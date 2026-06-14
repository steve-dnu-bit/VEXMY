import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { clampDepositAmount, DEFAULT_DEPOSIT_AMOUNT } from "./deposit-limits.ts";
import { getOrgBillingContext } from "./org-billing.ts";

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

type ShopCountryCode = (typeof SHOP_COUNTRIES)[number]["code"];

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
  FR: "FR",
  FRANCE: "FR",
  RO: "RO",
  ROMANIA: "RO",
  IT: "IT",
  ITALY: "IT",
  ES: "ES",
  SPAIN: "ES",
  SE: "SE",
  SWEDEN: "SE",
  NO: "NO",
  NORWAY: "NO",
  NL: "NL",
  NETHERLANDS: "NL",
  BG: "BG",
  BULGARIA: "BG",
};

export function normalizeShopCountryCode(country: string | null | undefined): ShopCountryCode {
  const raw = (country || "UK").trim().toUpperCase();
  if (raw in COUNTRY_ALIASES) return COUNTRY_ALIASES[raw];
  const byCode = SHOP_COUNTRIES.find((c) => c.code === raw);
  if (byCode) return byCode.code;
  const byStripe = SHOP_COUNTRIES.find((c) => c.stripeCountry === raw);
  if (byStripe) return byStripe.code;
  return "UK";
}

export function currencyForShopCountry(country: string | null | undefined): string {
  const code = normalizeShopCountryCode(country);
  return SHOP_COUNTRIES.find((c) => c.code === code)?.currency ?? "gbp";
}

export function stripeCountryForShopCountry(country: string | null | undefined): string {
  const code = normalizeShopCountryCode(country);
  return SHOP_COUNTRIES.find((c) => c.code === code)?.stripeCountry ?? "GB";
}

export function formatShopMoney(amount: number, currency: string): string {
  const code = (currency || "gbp").toUpperCase();
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: code }).format(amount);
  } catch {
    return `${Number(amount).toFixed(2)} ${code}`;
  }
}

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

export async function getShopPaymentSettings(
  admin: SupabaseClient,
  organizationId: string | null | undefined,
): Promise<{ country: string; countryCode: string; currency: string; defaultDepositAmount: number }> {
  const billing = await getOrgBillingContext(admin, organizationId);

  let defaultDepositAmount = DEFAULT_DEPOSIT_AMOUNT;
  if (organizationId) {
    const { data: shop } = await admin
      .from("shop_settings")
      .select("default_deposit_amount")
      .eq("organization_id", organizationId)
      .maybeSingle();
    defaultDepositAmount = Number(shop?.default_deposit_amount ?? DEFAULT_DEPOSIT_AMOUNT);
  } else {
    const { data: shop } = await admin
      .from("shop_settings")
      .select("default_deposit_amount")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    defaultDepositAmount = Number(shop?.default_deposit_amount ?? DEFAULT_DEPOSIT_AMOUNT);
  }

  return {
    country: billing.countryCode,
    countryCode: billing.countryCode,
    currency: billing.currency,
    defaultDepositAmount: clampDepositAmount(defaultDepositAmount, billing.currency),
  };
}

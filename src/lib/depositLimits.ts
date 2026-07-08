import { stripeMinimumChargeMajor } from "@/lib/shopCurrency";

/** Platform-wide deposit cap expressed as £200 GBP equivalent. */
export const MAX_DEPOSIT_GBP = 200;

/**
 * Approximate GBP → shop-currency rates for the deposit cap (not live FX).
 * Keep in sync with supabase/functions/_shared/deposit-limits.ts and deposit SQL migration.
 */
const GBP_TO_CURRENCY_RATE: Record<string, number> = {
  gbp: 1,
  usd: 1.275,
  eur: 1.175,
  cad: 1.725,
  aud: 1.95,
  ron: 5.85,
  sek: 13.5,
  nok: 13.8,
  bgn: 2.325,
};

const ZERO_DECIMAL_CURRENCIES = new Set(["sek", "nok", "ron"]);

export function maxDepositAmountForCurrency(currency: string): number {
  const code = (currency || "gbp").toLowerCase();
  const rate = GBP_TO_CURRENCY_RATE[code] ?? 1;
  const raw = MAX_DEPOSIT_GBP * rate;
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return Math.round(raw);
  return Math.round(raw * 100) / 100;
}

export function minDepositAmountForCurrency(currency: string): number {
  return stripeMinimumChargeMajor(currency);
}

export function clampDepositAmount(value: number, currency: string): number {
  if (value === 0) return 0;
  const min = minDepositAmountForCurrency(currency);
  const max = maxDepositAmountForCurrency(currency);
  const rounded = ZERO_DECIMAL_CURRENCIES.has((currency || "gbp").toLowerCase())
    ? Math.round(value)
    : Math.round(value * 100) / 100;
  return Math.max(min, Math.min(max, rounded));
}

export function isValidDepositAmount(value: number, currency: string): boolean {
  if (value === 0) return true;
  const min = minDepositAmountForCurrency(currency);
  const max = maxDepositAmountForCurrency(currency);
  return Number.isFinite(value) && value >= min && value <= max;
}

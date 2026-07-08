import { stripeMinimumChargeMajor } from "./shop-currency.ts";

export const DEFAULT_DEPOSIT_AMOUNT = 50;
export const MAX_DEPOSIT_GBP = 200;

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

export function clampDepositAmount(value: number, currency: string): number {
  if (value === 0) return 0;
  const min = stripeMinimumChargeMajor(currency);
  const max = maxDepositAmountForCurrency(currency);
  const rounded = ZERO_DECIMAL_CURRENCIES.has((currency || "gbp").toLowerCase())
    ? Math.round(value)
    : Math.round(value * 100) / 100;
  return Math.max(min, Math.min(max, rounded));
}

export function resolveBookingDepositAmount(
  bookingAmount: number | null | undefined,
  shopDefault: number | null | undefined,
  currency: string,
): number {
  if (bookingAmount === 0) return 0;
  const raw = bookingAmount ?? shopDefault ?? DEFAULT_DEPOSIT_AMOUNT;
  return clampDepositAmount(Number(raw), currency);
}

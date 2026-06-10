import { supabase } from "@/integrations/supabase/client";
import { currencyForShopCountry } from "@/lib/shopCurrency";
import {
  clampDepositAmount,
  isValidDepositAmount,
  maxDepositAmountForCurrency,
  minDepositAmountForCurrency,
} from "@/lib/depositLimits";
import { loadShopSettings } from "@/lib/shopSettings";

export const DEFAULT_DEPOSIT_AMOUNT = 50;

export { maxDepositAmountForCurrency, minDepositAmountForCurrency, clampDepositAmount };

export function parseDepositInput(raw: string, currency: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return clampDepositAmount(n, currency);
}

export async function loadShopDefaultDepositAmount(): Promise<number> {
  const shop = await loadShopSettings();
  const currency = currencyForShopCountry(shop?.country);
  if (!shop?.id) return DEFAULT_DEPOSIT_AMOUNT;

  const { data, error } = await supabase
    .from("shop_settings" as any)
    .select("default_deposit_amount")
    .eq("id", shop.id)
    .maybeSingle();

  if (error || data?.default_deposit_amount == null) return DEFAULT_DEPOSIT_AMOUNT;
  return clampDepositAmount(Number(data.default_deposit_amount), currency);
}

export async function saveShopDefaultDepositAmount(amount: number): Promise<{ error: string | null }> {
  const shop = await loadShopSettings();
  if (!shop?.id) return { error: "Shop settings not found" };

  const currency = currencyForShopCountry(shop.country);
  const min = minDepositAmountForCurrency(currency);
  const max = maxDepositAmountForCurrency(currency);

  if (!isValidDepositAmount(amount, currency)) {
    return { error: `Deposit must be between ${min} and ${max}` };
  }

  const { error } = await supabase
    .from("shop_settings" as any)
    .update({
      default_deposit_amount: clampDepositAmount(amount, currency),
      updated_at: new Date().toISOString(),
    })
    .eq("id", shop.id);

  return { error: error?.message ?? null };
}

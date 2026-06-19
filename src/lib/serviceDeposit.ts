import { clampDepositAmount } from "@/lib/depositLimits";

export interface ServiceDepositConfig {
  deposit_required?: boolean | null;
  deposit_amount?: number | null;
}

/** Deposit amount for a new booking based on service settings and shop default. */
export function resolveDepositForService(
  service: ServiceDepositConfig | null | undefined,
  shopDefaultAmount: number,
  currency: string,
): number {
  if (!service?.deposit_required) return 0;
  const preset = service.deposit_amount != null ? Number(service.deposit_amount) : shopDefaultAmount;
  return clampDepositAmount(preset, currency);
}

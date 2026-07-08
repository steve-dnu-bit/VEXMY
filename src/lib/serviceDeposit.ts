import { clampDepositAmount } from "@/lib/depositLimits";

export interface ServiceDepositConfig {
  deposit_required?: boolean | null;
  deposit_amount?: number | null;
}

export type BookingDepositLookup = {
  deposit_amount?: number | null;
  deposit_paid?: boolean | null;
  vip_client?: boolean | null;
};

export type BookingDepositStatus = "not_required" | "paid" | "pending";

export function resolveBookingDepositAmount(
  booking: Pick<BookingDepositLookup, "deposit_amount">,
  shopDefaultAmount: number,
): number {
  return booking.deposit_amount ?? shopDefaultAmount;
}

/** Deposit status for display (not the same as deposit_paid when no deposit is required). */
export function getBookingDepositStatus(
  booking: BookingDepositLookup,
  shopDefaultAmount: number,
): BookingDepositStatus {
  if (booking.vip_client) return "not_required";
  const amount = resolveBookingDepositAmount(booking, shopDefaultAmount);
  if (amount <= 0) return "not_required";
  if (booking.deposit_paid) return "paid";
  return "pending";
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

/** Whether the booking still needs a deposit payment (excludes VIP and zero-deposit services). */
export function bookingRequiresDeposit(booking: BookingDepositLookup, shopDefaultAmount: number): boolean {
  return getBookingDepositStatus(booking, shopDefaultAmount) === "pending";
}

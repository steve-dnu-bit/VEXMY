import { describe, expect, it } from "vitest";
import {
  bookingRequiresDeposit,
  getBookingDepositStatus,
  resolveDepositForService,
} from "@/lib/serviceDeposit";

describe("resolveDepositForService", () => {
  it("returns 0 when deposit is not required", () => {
    expect(resolveDepositForService({ deposit_required: false }, 50, "gbp")).toBe(0);
    expect(resolveDepositForService(null, 50, "gbp")).toBe(0);
  });

  it("uses shop default when deposit is required without a preset", () => {
    expect(resolveDepositForService({ deposit_required: true }, 50, "gbp")).toBe(50);
  });
});

describe("getBookingDepositStatus", () => {
  it("is not_required for zero-deposit bookings even when deposit_paid is true", () => {
    expect(getBookingDepositStatus({ deposit_amount: 0, deposit_paid: true }, 50)).toBe("not_required");
    expect(getBookingDepositStatus({ deposit_amount: 0, deposit_paid: false }, 50)).toBe("not_required");
  });

  it("is pending for unpaid bookings with a positive deposit", () => {
    expect(getBookingDepositStatus({ deposit_amount: 50, deposit_paid: false }, 50)).toBe("pending");
  });

  it("is paid only when a deposit was actually required and paid", () => {
    expect(getBookingDepositStatus({ deposit_amount: 50, deposit_paid: true }, 50)).toBe("paid");
  });
});

describe("bookingRequiresDeposit", () => {
  it("is false for zero-deposit bookings", () => {
    expect(bookingRequiresDeposit({ deposit_amount: 0, deposit_paid: false }, 50)).toBe(false);
    expect(bookingRequiresDeposit({ deposit_amount: 0, deposit_paid: true }, 50)).toBe(false);
  });

  it("is true for unpaid bookings with a positive deposit", () => {
    expect(bookingRequiresDeposit({ deposit_amount: 50, deposit_paid: false }, 50)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { isSupabaseAuthLockError, userFacingErrorMessage } from "@/lib/authErrors";

describe("isSupabaseAuthLockError", () => {
  it("detects navigator lock steal aborts", () => {
    const error = new DOMException(
      "Lock broken by another request with the steal option",
      "AbortError",
    );
    expect(isSupabaseAuthLockError(error)).toBe(true);
  });

  it("returns null for lock races in userFacingErrorMessage", () => {
    const error = new Error("Lock broken by another request with the steal option");
    expect(userFacingErrorMessage(error, "fallback")).toBeNull();
  });

  it("passes through normal errors", () => {
    expect(userFacingErrorMessage(new Error("Network failed"), "fallback")).toBe("Network failed");
  });
});

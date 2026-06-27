import { describe, expect, it } from "vitest";
import { generateGoogleNonce } from "@/lib/googleIdentity";

describe("generateGoogleNonce", () => {
  it("returns raw and 64-char hex hashed nonce", async () => {
    const [raw, hashed] = await generateGoogleNonce();
    expect(raw.length).toBeGreaterThan(10);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });
});

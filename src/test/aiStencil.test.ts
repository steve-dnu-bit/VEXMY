import { describe, expect, it } from "vitest";
import {
  parseStencilApiResponse,
  StencilQuotaError,
  StencilGenerationError,
  STENCIL_CONTENT_BLOCKED_CODE,
} from "@/lib/aiStencil";

describe("parseStencilApiResponse", () => {
  it("returns stencil on success", () => {
    const result = parseStencilApiResponse(
      200,
      {
        stencilUrl: "https://example.supabase.co/storage/v1/object/sign/uploads/stencil.png",
        style: "bold",
        quota: { remaining: 2 },
      },
      "valoonia",
    );
    expect(result.stencilUrl).toContain("https://");
    expect(result.style).toBe("bold");
  });

  it("throws quota error on 429", () => {
    expect(() =>
      parseStencilApiResponse(
        429,
        { error: "Limit reached", quota: { remaining: 0, limit: 3, used: 3 } },
        "valoonia",
      ),
    ).toThrow(StencilQuotaError);
  });

  it("throws content-blocked error on 422 copyright refusal", () => {
    try {
      parseStencilApiResponse(
        422,
        {
          error: "This photo can’t be turned into a stencil because it looks copyrighted or protected.",
          code: STENCIL_CONTENT_BLOCKED_CODE,
        },
        "valoonia",
      );
      throw new Error("expected StencilGenerationError");
    } catch (e) {
      expect(e).toBeInstanceOf(StencilGenerationError);
      expect((e as StencilGenerationError).code).toBe(STENCIL_CONTENT_BLOCKED_CODE);
    }
  });

  it("accepts a signed HTTPS stencil URL", () => {
    const result = parseStencilApiResponse(
      200,
      { stencilUrl: "https://example.supabase.co/storage/v1/object/sign/uploads/stencil.png", style: "bold" },
      "valoonia",
    );
    expect(result.stencilUrl).toContain("https://");
    expect(result.style).toBe("bold");
  });
});

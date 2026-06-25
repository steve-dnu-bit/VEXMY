import { describe, expect, it } from "vitest";
import {
  parseStencilApiResponse,
  StencilQuotaError,
} from "@/lib/aiStencil";

describe("parseStencilApiResponse", () => {
  it("returns stencil on success", () => {
    const result = parseStencilApiResponse(
      200,
      { stencilUrl: "data:image/png;base64,abc", style: "bold", quota: { remaining: 2 } },
      "valoonia",
    );
    expect(result.stencilUrl).toBe("data:image/png;base64,abc");
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

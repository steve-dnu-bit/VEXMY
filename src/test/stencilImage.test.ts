import { describe, expect, it } from "vitest";
import { dataUrlToBlob, fileToDataUrl } from "@/lib/stencilImage";

describe("dataUrlToBlob", () => {
  it("decodes a base64 PNG data URL without fetch", () => {
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const blob = dataUrlToBlob(dataUrl);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("fileToDataUrl", () => {
  it("uses cached data URL without re-reading the file", async () => {
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const emptyFile = new File([], "photo.jpg", { type: "image/jpeg" });
    const result = await fileToDataUrl(emptyFile, dataUrl);
    expect(result).toBe(dataUrl);
  });
});

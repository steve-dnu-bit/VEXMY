import { getFreshAccessToken } from "@/lib/edgeFunctions";
import { loadImage, readFileAsDataUrl } from "@/lib/stencilImage";

// Longest edge (px) sent to the AI. Keeps the request payload comfortably under
// the function body limit and speeds up generation without losing detail.
const MAX_UPLOAD_SIDE = 1536;

// Available AI stencil styles. `id` is sent to the function (must match the
// keys in netlify/functions/generate-stencil.mts). `nameKey` is the artist name
// shown on the style card; `descKey` is the short technique descriptor below it.
export const STENCIL_STYLES = [
  { id: "valoonia", nameKey: "stencil.styleValooniaName", descKey: "stencil.styleValooniaDesc" },
  { id: "bold", nameKey: "stencil.styleBoldName", descKey: "stencil.styleBoldDesc" },
  { id: "fineline", nameKey: "stencil.styleFinelineName", descKey: "stencil.styleFinelineDesc" },
  { id: "sketch", nameKey: "stencil.styleSketchName", descKey: "stencil.styleSketchDesc" },
  { id: "dotwork", nameKey: "stencil.styleDotworkName", descKey: "stencil.styleDotworkDesc" },
  { id: "blackwork", nameKey: "stencil.styleBlackworkName", descKey: "stencil.styleBlackworkDesc" },
] as const;

export type StencilStyle = (typeof STENCIL_STYLES)[number]["id"];
export const DEFAULT_STENCIL_STYLE: StencilStyle = "valoonia";

export type QuotaInfo = {
  used?: number;
  limit?: number;
  remaining?: number;
  allowed?: boolean;
};

export class StencilQuotaError extends Error {
  quota?: QuotaInfo;
  constructor(message: string, quota?: QuotaInfo) {
    super(message);
    this.name = "StencilQuotaError";
    this.quota = quota;
  }
}

export type AiStencilResult = {
  stencilUrl: string;
  style: string;
  quota?: QuotaInfo | null;
};

/** Downscale + re-encode the reference so the request stays small and fast. */
async function toUploadDataUrl(file: File): Promise<string> {
  const original = await readFileAsDataUrl(file);
  const img = await loadImage(original);
  const longest = Math.max(img.width, img.height);
  const scale = longest > MAX_UPLOAD_SIDE ? MAX_UPLOAD_SIDE / longest : 1;
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Generate a tattoo stencil from a reference image using the Netlify AI Gateway
 * function (billed to Netlify credits). Returns a PNG data URL ready to persist
 * and download, plus the remaining daily quota.
 */
export async function generateAiStencil(
  file: File,
  style: StencilStyle = DEFAULT_STENCIL_STYLE,
): Promise<AiStencilResult> {
  const token = await getFreshAccessToken();
  if (!token) throw new Error("Session expired. Please sign in again.");

  const image = await toUploadDataUrl(file);

  const res = await fetch("/api/generate-stencil", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image, style }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    stencilUrl?: string;
    style?: string;
    quota?: QuotaInfo | null;
    error?: string;
  };

  if (res.status === 429 && payload.quota) {
    throw new StencilQuotaError(payload.error || "Daily stencil limit reached.", payload.quota);
  }
  if (!res.ok) {
    throw new Error(payload.error || `Generation failed (${res.status})`);
  }
  if (!payload.stencilUrl) {
    throw new Error("No stencil image was returned.");
  }
  return {
    stencilUrl: payload.stencilUrl,
    style: payload.style || style,
    quota: payload.quota ?? null,
  };
}

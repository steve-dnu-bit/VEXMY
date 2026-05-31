import { getFreshAccessToken } from "@/lib/edgeFunctions";
import { loadImage, readFileAsDataUrl } from "@/lib/stencilImage";

// Longest edge (px) sent to the AI. Keeps the request payload comfortably under
// the function body limit and speeds up generation without losing detail.
const MAX_UPLOAD_SIDE = 1536;

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
 * Generate a Valoonia-grade tattoo stencil from a reference image using the
 * Netlify AI Gateway function (billed to Netlify credits). Returns a PNG data
 * URL ready to persist and download.
 */
export async function generateAiStencil(file: File): Promise<string> {
  const token = await getFreshAccessToken();
  if (!token) throw new Error("Session expired. Please sign in again.");

  const image = await toUploadDataUrl(file);

  const res = await fetch("/api/generate-stencil", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    stencilUrl?: string;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(payload.error || `Generation failed (${res.status})`);
  }
  if (!payload.stencilUrl) {
    throw new Error("No stencil image was returned.");
  }
  return payload.stencilUrl;
}

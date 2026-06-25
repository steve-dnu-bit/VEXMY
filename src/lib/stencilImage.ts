import { resolveUploadUrl } from "@/lib/uploadStorage";

/** Read a user-picked image as a data URL (Android-safe). */
export async function fileToDataUrl(file: File, cached?: string | null): Promise<string> {
  if (cached?.startsWith("data:")) return cached;
  if (!file || file.size <= 0) throw new Error("Failed to read image");

  // Capacitor Android: gallery `File` handles often fail on a second FileReader pass.
  // Copy bytes through an object URL first when possible.
  let source: Blob = file;
  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      const res = await fetch(objectUrl);
      const blob = await res.blob();
      if (blob.size > 0) source = blob;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    // Use the original File below.
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:")) resolve(result);
      else reject(new Error("Failed to read image"));
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(source);
  });
}

export const readFileAsDataUrl = (file: File) => fileToDataUrl(file);

export const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });

/** Downscale + re-encode for AI upload. Reuses a cached data URL when the File handle is stale. */
export async function prepareStencilUploadDataUrl(
  file: File,
  cachedDataUrl?: string | null,
  maxSide = 1536,
): Promise<string> {
  const original = await fileToDataUrl(file, cachedDataUrl);
  let img: HTMLImageElement;
  try {
    img = await loadImage(original);
  } catch {
    const res = await fetch(original);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to load image");
      ctx.drawImage(bitmap, 0, 0);
      img = await loadImage(canvas.toDataURL("image/jpeg", 0.92));
    } finally {
      bitmap.close();
    }
  }

  const longest = Math.max(img.width, img.height);
  const scale = longest > maxSide ? maxSide / longest : 1;
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return original.startsWith("data:") ? original : await fileToDataUrl(file, original);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/** Parse a data URL into a Blob without fetch (avoids CSP connect-src blocks on data:). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error("Invalid image data URL");
  const mime = match[1] || "application/octet-stream";
  const isBase64 = !!match[2];
  const payload = match[3];
  if (isBase64) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

/** Build a File for storage upload from the picker or cached preview (Android-safe). */
export async function fileForStencilUpload(file: File, cachedDataUrl?: string | null): Promise<File> {
  if (file.size > 0) return file;
  if (!cachedDataUrl?.startsWith("data:")) throw new Error("Failed to read image");
  const blob = dataUrlToBlob(cachedDataUrl);
  const ext = (file.name.split(".").pop() || blob.type.split("/")[1] || "jpg").toLowerCase();
  return new File([blob], file.name || `photo.${ext}`, { type: blob.type || "image/jpeg" });
}

/** Data URL, signed HTTPS URL, or uploads: storage ref → Blob. */
export async function blobFromImageSource(src: string): Promise<Blob> {
  if (src.startsWith("data:")) return dataUrlToBlob(src);
  let url = src;
  if (!src.startsWith("http://") && !src.startsWith("https://")) {
    const resolved = await resolveUploadUrl(src);
    if (!resolved) throw new Error("Failed to resolve stencil image");
    url = resolved;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to download stencil");
  return res.blob();
}

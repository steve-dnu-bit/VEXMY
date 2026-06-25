import { resolveUploadUrl } from "@/lib/uploadStorage";

export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });

export const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });

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

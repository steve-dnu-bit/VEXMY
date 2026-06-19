import { supabase } from "@/integrations/supabase/client";

/** Prefix for storage paths persisted in DB instead of public URLs. */
export const UPLOADS_STORAGE_REF_PREFIX = "uploads:";

const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7;

export function isUploadsStorageRef(value: string | null | undefined): boolean {
  return !!value && value.startsWith(UPLOADS_STORAGE_REF_PREFIX);
}

export function toUploadsStorageRef(path: string): string {
  return `${UPLOADS_STORAGE_REF_PREFIX}${path}`;
}

export function uploadsPathFromRef(ref: string): string {
  return ref.startsWith(UPLOADS_STORAGE_REF_PREFIX) ? ref.slice(UPLOADS_STORAGE_REF_PREFIX.length) : ref;
}

/** Storage object path from uploads: ref or legacy Supabase public/sign URL. */
export function uploadsStoragePathFromStored(stored: string): string | null {
  if (isUploadsStorageRef(stored)) return uploadsPathFromRef(stored);
  try {
    const pathname = new URL(stored).pathname;
    const marker = "/uploads/";
    const idx = pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

/** Resolve a legacy public URL or storage ref to a fetchable URL (signed when bucket is private). */
export async function resolveUploadUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored?.trim()) return null;
  const value = stored.trim();
  const path = uploadsStoragePathFromStored(value);
  if (path) {
    const { data, error } = await supabase.storage.from("uploads").createSignedUrl(path, SIGNED_URL_TTL_SEC);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return null;
}

export async function uploadFileToUploads(path: string, file: File | Blob): Promise<string> {
  const { error } = await supabase.storage.from("uploads").upload(path, file);
  if (error) throw error;
  return toUploadsStorageRef(path);
}

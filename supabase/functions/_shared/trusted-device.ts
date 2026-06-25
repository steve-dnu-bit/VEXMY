const TRUSTED_DEVICE_TTL_DAYS = 60;

export async function hashDeviceToken(userId: string, deviceId: string): Promise<string> {
  const pepper = (Deno.env.get("TRUSTED_DEVICE_PEPPER") ?? "").trim();
  if (!pepper) throw new Error("TRUSTED_DEVICE_PEPPER not configured");
  const data = new TextEncoder().encode(`${pepper}:${userId}:${deviceId}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function trustedDeviceExpiresAt(): string {
  const ms = TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

export function factorIdsMatch(stored: string[] | null | undefined, current: string[]): boolean {
  const a = [...(stored ?? [])].sort();
  const b = [...current].sort();
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

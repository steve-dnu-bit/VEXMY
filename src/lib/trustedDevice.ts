import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { getVerifiedMfaFactorIds } from "@/lib/mfa";

const STORAGE_KEY = "velbok_trusted_device_id";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export async function checkTrustedDeviceBypass(): Promise<boolean> {
  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return false;

  const factorIds = await getVerifiedMfaFactorIds();
  if (factorIds.length === 0) return false;

  const { data, error } = await invokeEdgeFunctionJson<{ trusted?: boolean }>("mfa-trusted-device", {
    action: "check",
    device_id: deviceId,
    factor_ids: factorIds,
  });

  if (error) return false;
  return !!data?.trusted;
}

export async function registerTrustedDevice(): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return;

  const factorIds = await getVerifiedMfaFactorIds();
  if (factorIds.length === 0) return;

  await invokeEdgeFunctionJson("mfa-trusted-device", {
    action: "register",
    device_id: deviceId,
    factor_ids: factorIds,
  });
}

export async function revokeAllTrustedDevices(): Promise<{ error: Error | null }> {
  const { error } = await invokeEdgeFunctionJson("mfa-trusted-device", { action: "revoke_all" });
  return { error };
}

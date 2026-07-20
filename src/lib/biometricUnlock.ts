import { Capacitor } from "@capacitor/core";
import { STORAGE_PREFIX } from "@/lib/branding";
import { nativePlatform } from "@/lib/platform";

const ENABLED_KEY = `${STORAGE_PREFIX}.biometric_unlock_enabled`;
const PROMPTED_KEY = `${STORAGE_PREFIX}.biometric_unlock_prompted`;
const UNLOCKED_SESSION_KEY = `${STORAGE_PREFIX}.biometric_session_unlocked`;

export function isBiometricUnlockEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBiometricUnlockEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
    if (enabled) {
      sessionStorage.setItem(UNLOCKED_SESSION_KEY, "1");
    }
  } catch {
    /* ignore */
  }
}

export function hasPromptedBiometricUnlock(): boolean {
  try {
    return localStorage.getItem(PROMPTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markBiometricUnlockPrompted(): void {
  try {
    localStorage.setItem(PROMPTED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isBiometricSessionUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCKED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markBiometricSessionUnlocked(): void {
  try {
    sessionStorage.setItem(UNLOCKED_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearBiometricSessionUnlocked(): void {
  try {
    sessionStorage.removeItem(UNLOCKED_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export type BiometricAvailability = {
  available: boolean;
  biometryType: "faceId" | "touchId" | "fingerprint" | "faceAuthentication" | "irisAuthentication" | "multiple" | "none";
};

/** Lazy-load plugin so web builds do not fail when the package is missing from a stale install. */
async function loadBiometricPlugin(): Promise<{
  checkBiometry: () => Promise<{ isAvailable: boolean; biometryType: number }>;
  authenticate: (options: { reason: string; cancelTitle?: string }) => Promise<void>;
} | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const mod = await import("@aparajita/capacitor-biometric-auth");
    return mod.BiometricAuth;
  } catch {
    return null;
  }
}

const BIOMETRY_MAP: Record<number, BiometricAvailability["biometryType"]> = {
  0: "none",
  1: "touchId",
  2: "faceId",
  3: "fingerprint",
  4: "faceAuthentication",
  5: "irisAuthentication",
  6: "multiple",
};

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  const plugin = await loadBiometricPlugin();
  if (!plugin) return { available: false, biometryType: "none" };
  try {
    const result = await plugin.checkBiometry();
    return {
      available: !!result.isAvailable,
      biometryType: BIOMETRY_MAP[result.biometryType] ?? "none",
    };
  } catch {
    return { available: false, biometryType: "none" };
  }
}

export async function authenticateWithBiometrics(reason: string): Promise<boolean> {
  const plugin = await loadBiometricPlugin();
  if (!plugin) return false;
  try {
    await plugin.authenticate({
      reason,
      cancelTitle: nativePlatform() === "ios" ? "Cancel" : undefined,
    });
    markBiometricSessionUnlocked();
    return true;
  } catch {
    return false;
  }
}

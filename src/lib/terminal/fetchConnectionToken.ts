import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import {
  abortTerminalOperation,
  isReaderFirmwareUpdating,
} from "@/lib/terminal/nativeTerminalState";
import { getCachedTerminalLocationId } from "@/lib/terminal/terminalLocationCache";

const TOKEN_CACHE_MS = 55_000;
const TOKEN_FETCH_TIMEOUT_MS = 20_000;

let cachedToken: string | null = null;
let cachedTokenAt = 0;

function cacheToken(token: string): string {
  cachedToken = token;
  cachedTokenAt = Date.now();
  return token;
}

function clearTokenCache(): void {
  cachedToken = null;
  cachedTokenAt = 0;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function formatConnectionTokenError(error: Error | null, locationId?: string | null): string {
  const raw = error?.message?.trim() || "Could not get Terminal connection token";
  if (/session expired|sign in again/i.test(raw)) {
    return `${raw} Open Velbok, sign out and sign back in, then try again.`;
  }
  if (/connect.*not ready|connect_required/i.test(raw)) {
    return "Stripe Connect is not ready for this studio. Finish Connect setup in Velbok Admin → POS checkout first.";
  }
  if (/location|resource_missing|no such location/i.test(raw)) {
    return "Terminal location is missing or invalid. In Velbok Admin → POS checkout, tap Create Terminal location, then try again.";
  }
  if (!locationId?.trim()) {
    return "Terminal location is not set up yet. Create a Terminal location in Admin → POS checkout, then try Enable Tap to Pay again.";
  }
  if (/network|fetch|timeout|timed out/i.test(raw)) {
    return `${raw} Try mobile data instead of shop Wi‑Fi, or wait a few seconds and retry.`;
  }
  return `${raw} Check phone internet and that Stripe Connect is complete for your studio.`;
}

/** Serialize native token delivery — concurrent RequestedConnectionToken events race setConnectionToken. */
let tokenDeliveryChain: Promise<void> = Promise.resolve();

async function deliverTokenOnce(locationOverride?: string | null): Promise<void> {
  const locationId = locationOverride?.trim() || getCachedTerminalLocationId() || undefined;
  let token = await provideTerminalConnectionToken(locationId);
  let delivered = await deliverTerminalConnectionToken(token);
  if (!delivered) {
    token = await provideTerminalConnectionToken(locationId);
    delivered = await deliverTerminalConnectionToken(token);
  }
  if (!delivered) {
    throw new Error("Could not deliver Terminal connection token — force-close Velbok and try again.");
  }
}

/** Called from the SDK RequestedConnectionToken listener — one delivery per SDK request, in order. */
export function enqueueTerminalConnectionTokenDelivery(locationOverride?: string | null): Promise<void> {
  const task = tokenDeliveryChain.then(() => deliverTokenOnce(locationOverride));
  tokenDeliveryChain = task.catch(() => undefined);
  return task;
}

export async function runStripeTerminalPreflight(locationId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!locationId.trim()) {
    return { ok: false, message: "Terminal location missing — create one in Admin → POS checkout." };
  }
  try {
    await fetchTerminalConnectionToken(locationId);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe connection token failed";
    return { ok: false, message };
  }
}

export async function fetchTerminalConnectionToken(locationOverride?: string | null): Promise<string> {
  const locationId = locationOverride?.trim() || getCachedTerminalLocationId();
  if (!locationId) {
    throw new Error("Terminal location is not set up yet.");
  }

  const fetchPromise = (async () => {
    const { data, error } = await invokeEdgeFunctionJson<{ secret?: string; code?: string }>(
      "stripe-terminal-pos",
      {
        action: "connection_token",
        locationId,
      },
    );
    if (error || !data.secret) {
      throw new Error(formatConnectionTokenError(error, locationId));
    }
    return cacheToken(data.secret);
  })();

  try {
    return await withTimeout(
      fetchPromise,
      TOKEN_FETCH_TIMEOUT_MS,
      "Terminal connection token timed out — check phone internet and try again.",
    );
  } catch (error) {
    clearTokenCache();
    throw error instanceof Error ? error : new Error(formatConnectionTokenError(null, locationId));
  }
}

/**
 * Entry for SDK token requests. Returns a fresh token each call except during firmware
 * OTA, when a recent cached token is reused so extra network calls do not interrupt the update.
 */
export async function provideTerminalConnectionToken(locationOverride?: string | null): Promise<string> {
  if (
    isReaderFirmwareUpdating() &&
    cachedToken &&
    Date.now() - cachedTokenAt < TOKEN_CACHE_MS
  ) {
    return cachedToken;
  }

  return fetchTerminalConnectionToken(locationOverride);
}

/**
 * Hand the token to the native SDK. Must only run in response to RequestedConnectionToken.
 * Returns false when the SDK is no longer waiting (stale response after timeout/retry).
 */
export async function deliverTerminalConnectionToken(token: string): Promise<boolean> {
  const { StripeTerminal } = await import("@capacitor-community/stripe-terminal");
  try {
    await StripeTerminal.setConnectionToken({ token });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/do not pending fetchConnectionToken/i.test(message)) {
      console.warn("Ignored stale connection token delivery");
      return false;
    }
    throw error;
  }
}

/** Cancel discovery and mark the current reader operation failed after a token error. */
export async function handleTerminalConnectionTokenFailure(
  error: unknown,
  onConnectionTokenError?: (message: string) => void,
): Promise<void> {
  abortTerminalOperation();
  clearTokenCache();

  const { StripeTerminal } = await import("@capacitor-community/stripe-terminal");
  const { isNativeTerminalInitialized } = await import("@/lib/terminal/nativeTerminalState");
  if (isNativeTerminalInitialized()) {
    await StripeTerminal.cancelDiscoverReaders().catch(() => undefined);
  }

  const message =
    error instanceof Error
      ? error.message
      : "Could not get Terminal connection token — check phone internet and try mobile data";
  onConnectionTokenError?.(message);
}

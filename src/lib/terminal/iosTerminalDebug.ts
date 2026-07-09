import { Capacitor } from "@capacitor/core";

const DEBUG_SESSION = "5f644c";
const DEBUG_STORAGE_KEY = "velbok_debug_5f644c";
const INGEST =
  "http://127.0.0.1:7492/ingest/aee1b2f0-d00d-4f02-9cc4-300b51987979";

export type VelbokDebugEntry = {
  sessionId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
  hypothesisId: string;
  timestamp: number;
};

/** On-device + dev ingest logging for iPad/TestFlight debugging. */
export function velbokDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  const entry: VelbokDebugEntry = {
    sessionId: DEBUG_SESSION,
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
  };

  // #region agent log
  fetch(INGEST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION,
    },
    body: JSON.stringify(entry),
  }).catch(() => undefined);
  // #endregion

  try {
    const prev = JSON.parse(sessionStorage.getItem(DEBUG_STORAGE_KEY) || "[]") as VelbokDebugEntry[];
    prev.push(entry);
    sessionStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(prev.slice(-40)));
  } catch {
    /* ignore */
  }
}

export function readVelbokDebugLog(): VelbokDebugEntry[] {
  try {
    return JSON.parse(sessionStorage.getItem(DEBUG_STORAGE_KEY) || "[]") as VelbokDebugEntry[];
  } catch {
    return [];
  }
}

export function clearVelbokDebugLog(): void {
  try {
    sessionStorage.removeItem(DEBUG_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isIosNativeShell(): boolean {
  return Capacitor.getPlatform() === "ios";
}

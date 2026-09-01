import { nativePlatform } from "@/lib/platform";
import { TapToPayReadiness } from "@/lib/terminal/tapToPayReadiness";

/**
 * Structured trace of the Apple Tap to Pay on iPhone enable flow.
 *
 * Apple's Terms and Conditions sheet is presented inside Stripe's connectReader and only
 * ever appears once per Stripe account, so "no sheet" is ambiguous without a trace: it can
 * mean connectReader was skipped, or that Apple had nothing left to ask. Every decision
 * point in the enable path writes a line here so the two cases can be told apart.
 *
 * Lines go to three places:
 *  - Safari Web Inspector (console.info)
 *  - Xcode device console / Console.app (native bridge, same LOG_PREFIX)
 *  - an in-memory ring buffer the merchant can copy from Settings
 */
export const TTP_LOG_PREFIX = "[VELBOK-TTP]";

/**
 * A connectReader that finishes faster than this did not wait for a human to read and
 * agree to Apple's Terms. Used only as a heuristic hint in the trace, never as control flow.
 */
const APPLE_SHEET_MIN_MS = 12_000;

export type TapToPayDiagnosticEntry = {
  at: string;
  sinceStartMs: number;
  step: string;
  data?: Record<string, unknown>;
};

const BUFFER_LIMIT = 250;
const buffer: TapToPayDiagnosticEntry[] = [];
const startedAt = Date.now();

function safeSerialize(data: Record<string, unknown> | undefined): string {
  if (!data) return "";
  try {
    return JSON.stringify(data);
  } catch {
    return "[unserializable]";
  }
}

/** Record one decision point in the Tap to Pay enable flow. Never throws. */
export function ttpLog(step: string, data?: Record<string, unknown>): void {
  const entry: TapToPayDiagnosticEntry = {
    at: new Date().toISOString(),
    sinceStartMs: Date.now() - startedAt,
    step,
    ...(data ? { data } : {}),
  };

  buffer.push(entry);
  if (buffer.length > BUFFER_LIMIT) buffer.splice(0, buffer.length - BUFFER_LIMIT);

  const line = `${TTP_LOG_PREFIX} ${step}${data ? ` ${safeSerialize(data)}` : ""}`;
  try {
    console.info(line);
  } catch {
    /* ignore */
  }

  const platform = nativePlatform();
  if (platform === "ios" || platform === "android") {
    void TapToPayReadiness.log({ line }).catch(() => undefined);
  }
}

/** Record a thrown error against a step without losing the message. */
export function ttpLogError(step: string, error: unknown, data?: Record<string, unknown>): void {
  ttpLog(step, {
    ...data,
    error: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Annotate a connectReader timing so the trace says whether Apple could plausibly have
 * shown its Terms sheet, rather than leaving the reader to guess from a duration.
 */
export function describeConnectDuration(ms: number): Record<string, unknown> {
  return {
    ms,
    appleTermsSheetLikelyShown: ms >= APPLE_SHEET_MIN_MS,
    note:
      ms >= APPLE_SHEET_MIN_MS
        ? "slow connect — consistent with a human reading Apple's Terms sheet"
        : "fast connect — Apple had already recorded Terms acceptance for this Stripe account",
  };
}

export function getTapToPayDiagnostics(): TapToPayDiagnosticEntry[] {
  return [...buffer];
}

export function clearTapToPayDiagnostics(): void {
  buffer.length = 0;
}

/** Plain-text dump for the merchant to paste into a support message. */
export function formatTapToPayDiagnostics(): string {
  if (buffer.length === 0) return `${TTP_LOG_PREFIX} no Tap to Pay events recorded yet`;
  return buffer
    .map((entry) => `${entry.at} +${entry.sinceStartMs}ms ${entry.step}${entry.data ? ` ${safeSerialize(entry.data)}` : ""}`)
    .join("\n");
}

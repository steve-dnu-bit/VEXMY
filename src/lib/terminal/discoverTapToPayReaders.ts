import {
  StripeTerminal,
  TerminalConnectTypes,
  TerminalEventsEnum,
  type ReaderInterface,
} from "@capacitor-community/stripe-terminal";
import { mergeDiscoveredReaders, sleep } from "@/lib/terminal/discoverReadersShared";
import { formatTerminalError } from "@/lib/terminal/formatTerminalError";
import { checkTapToPayEnvironment } from "@/lib/terminal/tapToPayReadiness";
import { isNativeTerminalInitialized, isTerminalOperationAborted } from "@/lib/terminal/nativeTerminalState";
import { formatConnectionStatusForStaff } from "@/lib/terminal/terminalConnectionStatus";
import { fetchTerminalConfig } from "@/lib/terminal/fetchTerminalConfig";

/** Tap to Pay discovery can be slow on first run. */
const DISCOVERY_TIMEOUT_MS = 90_000;
/** Some devices report the reader slightly after discoverReaders resolves. */
const POST_DISCOVERY_WAIT_MS = 8_000;

function extractFailureText(info: { message?: string; code?: string } | undefined): string | null {
  if (!info) return null;
  const parts = [info.code, info.message].filter((part) => typeof part === "string" && part.trim());
  return parts.length ? parts.join(": ") : null;
}

async function buildEmptyDiscoveryMessage(): Promise<string> {
  const env = await checkTapToPayEnvironment();
  const device = env ? `${env.deviceManufacturer ?? ""} ${env.deviceModel ?? ""}`.trim() : "this phone";

  if (env?.debugBuild) {
    return formatTerminalError(
      "TAP_TO_PAY_DEBUG_NOT_SUPPORTED: release Velbok APK required",
      "Tap to Pay discovery failed",
    );
  }

  if (env?.stripeListWarning) {
    return formatTerminalError(
      `TAP_TO_PAY_UNSUPPORTED_DEVICE: ${device} is not on Stripe's Tap to Pay device list (Galaxy S22+, Pixel 6+, etc.). Use WisePad Bluetooth mode above, or a newer phone.`,
      "Tap to Pay not supported on this phone",
    );
  }

  return formatTerminalError(
    `Tap to Pay did not activate on ${device || "this phone"}. Stripe found no reader on the device — often unsupported hardware or a failed security check. Try WisePad (Bluetooth reader) in reader mode above.`,
    "Tap to Pay discovery failed",
  );
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

async function waitForDiscoveredReaders(
  getCollected: () => ReaderInterface[],
  timeoutMs: number,
  onStatus?: (message: string) => void,
): Promise<ReaderInterface[]> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const readers = getCollected();
    if (readers.length > 0) return readers;
    await sleep(400);
  }
  onStatus?.("Still waiting for Tap to Pay on this phone…");
  return getCollected();
}

/**
 * Tap to Pay discovery on Android — await discoverReaders (do not fire-and-forget).
 */
export async function discoverTapToPayReaders(
  locationId: string,
  onStatus?: (message: string) => void,
): Promise<ReaderInterface[]> {
  if (!locationId.trim()) {
    throw new Error("Terminal location is not set up yet.");
  }

  onStatus?.("Checking Tap to Pay on this phone…");

  const collected: ReaderInterface[] = [];
  let failureMessage: string | null = null;

  const discoveredListener = await StripeTerminal.addListener(
    TerminalEventsEnum.DiscoveredReaders,
    ({ readers }) => {
      const merged = mergeDiscoveredReaders(collected, readers);
      collected.splice(0, collected.length, ...merged);
      if (merged.length > 0) {
        onStatus?.("Tap to Pay found on this phone — connecting…");
      }
    },
  );

  const failedListener = await StripeTerminal.addListener(TerminalEventsEnum.Failed, (info) => {
    const text = extractFailureText(info as { message?: string; code?: string });
    if (text) failureMessage = text;
  });

  const connectionStatusListener = await StripeTerminal.addListener(
    TerminalEventsEnum.ConnectionStatusChange,
    ({ status }) => {
      if (!status) return;
      const staffMessage = formatConnectionStatusForStaff(String(status));
      if (staffMessage) onStatus?.(staffMessage);
    },
  );

  const progressTimer = window.setInterval(() => {
    onStatus?.("Still setting up phone payments… first time can take up to 1–2 minutes.");
  }, 15_000);

  try {
    if (isNativeTerminalInitialized()) {
      await StripeTerminal.cancelDiscoverReaders().catch(() => undefined);
      await sleep(400);
    }

    onStatus?.("Looking for Tap to Pay on this phone…");

    if (isTerminalOperationAborted()) {
      throw new Error("Terminal connection token failed — check internet and Stripe Connect setup.");
    }

    let tapToPaySimulated = false;
    try {
      const config = await fetchTerminalConfig();
      tapToPaySimulated = config.isTest;
    } catch {
      /* native plugin falls back to initialize isTest when simulated is omitted */
    }

    let resultReaders: ReaderInterface[] = [];
    try {
      const result = await withTimeout(
        StripeTerminal.discoverReaders({
          type: TerminalConnectTypes.TapToPay,
          locationId,
          simulated: tapToPaySimulated,
        } as Parameters<typeof StripeTerminal.discoverReaders>[0] & { simulated?: boolean }),
        DISCOVERY_TIMEOUT_MS,
        "Tap to Pay discovery timed out. Keep Velbok open in the foreground with Location allowed and try mobile data.",
      );
      resultReaders = result.readers ?? [];
    } catch (error: unknown) {
      const message = formatTerminalError(error, "Tap to Pay discovery failed");
      failureMessage = failureMessage || message;
      if (collected.length === 0) {
        throw new Error(failureMessage);
      }
    }

    let merged = mergeDiscoveredReaders(collected, resultReaders);
    if (merged.length === 0) {
      merged = await waitForDiscoveredReaders(() => collected, POST_DISCOVERY_WAIT_MS, onStatus);
    }
    merged = mergeDiscoveredReaders(merged, collected, resultReaders);

    if (merged.length > 0) {
      return merged;
    }

    if (failureMessage) {
      throw new Error(formatTerminalError(failureMessage, "Tap to Pay discovery failed"));
    }

    throw new Error(await buildEmptyDiscoveryMessage());
  } finally {
    window.clearInterval(progressTimer);
    await discoveredListener.remove();
    await failedListener.remove();
    await connectionStatusListener.remove();
  }
}

/** @deprecated use formatTerminalError directly — kept for imports */
export function formatTapToPayDiscoveryError(cause?: string | null): string {
  return cause?.trim()
    ? formatTerminalError(cause, "Tap to Pay discovery failed")
    : "Tap to Pay reader was not found on this device.";
}

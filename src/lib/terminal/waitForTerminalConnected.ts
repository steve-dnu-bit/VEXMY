import {
  StripeTerminal,
  TerminalEventsEnum,
} from "@capacitor-community/stripe-terminal";
import type { PluginListenerHandle } from "@capacitor/core";
import { sleep } from "@/lib/terminal/discoverReadersShared";
import {
  formatConnectionStatusForStaff,
  isStripeConnectedStatus,
  markTerminalConnectionEstablished,
} from "@/lib/terminal/terminalConnectionStatus";
import type { TerminalReaderInfo } from "@/lib/terminal/types";

type ReaderRefresh = () => Promise<TerminalReaderInfo | null>;

/**
 * Wait until Stripe reports a connected reader (status event, ConnectedReader, or getConnectedReader).
 * fallbackReader: use when connectReader succeeded but getConnectedReader() lags (common on Android TTP).
 */
export async function waitForTerminalConnected(
  refreshReader: ReaderRefresh,
  timeoutMs: number,
  onStatus?: (message: string) => void,
  fallbackReader?: TerminalReaderInfo,
): Promise<TerminalReaderInfo> {
  const existing = await refreshReader();
  if (existing) {
    markTerminalConnectionEstablished();
    return existing;
  }

  return new Promise<TerminalReaderInfo>((resolve, reject) => {
    let settled = false;
    const handles: PluginListenerHandle[] = [];
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const cleanup = async () => {
      if (pollTimer) clearInterval(pollTimer);
      await Promise.all(handles.map((handle) => handle.remove().catch(() => undefined)));
    };

    const succeed = async (useFallback = false) => {
      if (settled) return;
      const reader = useFallback && fallbackReader ? fallbackReader : await refreshReader();
      if (!reader && fallbackReader) {
        settled = true;
        markTerminalConnectionEstablished();
        await cleanup();
        resolve(fallbackReader);
        return;
      }
      if (!reader) return;
      settled = true;
      markTerminalConnectionEstablished();
      await cleanup();
      resolve(reader);
    };

    const fail = async (message: string) => {
      if (settled) return;
      settled = true;
      await cleanup();
      reject(new Error(message));
    };

    const timeoutId = window.setTimeout(() => {
      if (fallbackReader) {
        void succeed(true);
        return;
      }
      void fail(
        "Tap to Pay did not connect in time. Keep Velbok open, allow Location, Developer options OFF, then try again.",
      );
    }, timeoutMs);

    void (async () => {
      handles.push(
        await StripeTerminal.addListener(TerminalEventsEnum.ConnectionStatusChange, ({ status }) => {
          const statusText = status ? String(status) : "";
          if (!statusText) return;
          const staffMessage = formatConnectionStatusForStaff(statusText);
          if (staffMessage) onStatus?.(staffMessage);
          if (isStripeConnectedStatus(statusText)) {
            window.clearTimeout(timeoutId);
            void succeed(true);
          }
        }),
      );

      handles.push(
        await StripeTerminal.addListener(TerminalEventsEnum.ConnectedReader, () => {
          window.clearTimeout(timeoutId);
          void succeed(true);
        }),
      );

      pollTimer = setInterval(() => {
        void refreshReader().then((reader) => {
          if (reader) {
            window.clearTimeout(timeoutId);
            void succeed(false);
          }
        });
      }, 500);
    })();
  });
}

/** Best-effort reset before a retry — never call before Terminal.initialize() (crashes Android). */
export async function resetTerminalReaderSession(): Promise<void> {
  const { isNativeTerminalInitialized } = await import("@/lib/terminal/nativeTerminalState");
  if (!isNativeTerminalInitialized()) return;

  await StripeTerminal.cancelDiscoverReaders().catch(() => undefined);
  await StripeTerminal.disconnectReader().catch(() => undefined);
  await sleep(300);
}

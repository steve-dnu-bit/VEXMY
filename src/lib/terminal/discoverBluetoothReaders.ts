import {
  StripeTerminal,
  TerminalConnectTypes,
  TerminalEventsEnum,
  type ReaderInterface,
} from "@capacitor-community/stripe-terminal";
import { mergeDiscoveredReaders, sleep } from "@/lib/terminal/discoverReadersShared";
import { isTerminalOperationAborted } from "@/lib/terminal/nativeTerminalState";
import { nativePlatform } from "@/lib/platform";

const DISCOVERY_TIMEOUT_MS = 30_000;

/** BLE discovery streams readers via events; the promise can resolve before hardware appears. */
export async function discoverBluetoothReaders(locationId: string): Promise<ReaderInterface[]> {
  const collected: ReaderInterface[] = [];
  let failureMessage: string | null = null;

  const discoveredListener = await StripeTerminal.addListener(
    TerminalEventsEnum.DiscoveredReaders,
    ({ readers }) => {
      const merged = mergeDiscoveredReaders(collected, readers);
      collected.splice(0, collected.length, ...merged);
    },
  );

  const failedListener = await StripeTerminal.addListener(TerminalEventsEnum.Failed, (info) => {
    if (info?.message) failureMessage = info.message;
  });

  try {
    const discoveryPromise = StripeTerminal.discoverReaders({
      type: TerminalConnectTypes.Bluetooth,
      locationId,
      ...(nativePlatform() === "ios" ? { bluetoothScanWaitTime: 10 } : {}),
    })
      .then((result) => {
        const merged = mergeDiscoveredReaders(collected, result.readers);
        collected.splice(0, collected.length, ...merged);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message) failureMessage = error.message;
      });

    // iOS needs the awaited discovery call; fire-and-forget can race and crash the plugin.
    if (nativePlatform() === "ios") {
      await discoveryPromise;
      if (collected.length > 0) {
        return mergeDiscoveredReaders(collected);
      }
    } else {
      void discoveryPromise;
    }

    const deadline = Date.now() + DISCOVERY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (isTerminalOperationAborted()) {
        throw new Error("Terminal connection token failed — check internet and Stripe Connect setup.");
      }
      if (collected.length > 0) {
        return mergeDiscoveredReaders(collected);
      }
      await sleep(500);
    }

    if (failureMessage) {
      throw new Error(failureMessage);
    }

    return mergeDiscoveredReaders(collected);
  } finally {
    await StripeTerminal.cancelDiscoverReaders().catch(() => undefined);
    await discoveredListener.remove();
    await failedListener.remove();
  }
}

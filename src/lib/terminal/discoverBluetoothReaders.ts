import {
  StripeTerminal,
  TerminalConnectTypes,
  TerminalEventsEnum,
  type ReaderInterface,
} from "@capacitor-community/stripe-terminal";

const DISCOVERY_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function mergeReaders(...groups: Array<ReaderInterface[] | undefined>): ReaderInterface[] {
  const merged = new Map<string, ReaderInterface>();
  for (const group of groups) {
    for (const reader of group ?? []) {
      const key = reader.serialNumber || reader.label || String(reader.id);
      if (key) merged.set(key, reader);
    }
  }
  return Array.from(merged.values());
}

/** Android BLE discovery streams readers via events; the promise can resolve before hardware appears. */
export async function discoverBluetoothReaders(locationId: string): Promise<ReaderInterface[]> {
  const collected: ReaderInterface[] = [];
  let failureMessage: string | null = null;

  const discoveredListener = await StripeTerminal.addListener(
    TerminalEventsEnum.DiscoveredReaders,
    ({ readers }) => {
      const merged = mergeReaders(collected, readers);
      collected.splice(0, collected.length, ...merged);
    },
  );

  const failedListener = await StripeTerminal.addListener(TerminalEventsEnum.Failed, (info) => {
    if (info?.message) failureMessage = info.message;
  });

  try {
    void StripeTerminal.discoverReaders({
      type: TerminalConnectTypes.Bluetooth,
      locationId,
    })
      .then((result) => {
        const merged = mergeReaders(collected, result.readers);
        collected.splice(0, collected.length, ...merged);
      })
      .catch(() => undefined);

    const deadline = Date.now() + DISCOVERY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (collected.length > 0) {
        return mergeReaders(collected);
      }
      await sleep(500);
    }

    if (failureMessage) {
      throw new Error(failureMessage);
    }

    return mergeReaders(collected);
  } finally {
    await StripeTerminal.cancelDiscoverReaders().catch(() => undefined);
    await discoveredListener.remove();
    await failedListener.remove();
  }
}

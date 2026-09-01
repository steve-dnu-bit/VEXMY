import { fetchTerminalConnectionToken } from "@/lib/terminal/fetchConnectionToken";
import type {
  DiscoverAndConnectOptions,
  TerminalProvider,
  TerminalProviderOptions,
  TerminalReaderInfo,
} from "@/lib/terminal/types";

type TerminalInstance = {
  discoverReaders: (config: Record<string, unknown>) => Promise<{
    discoveredReaders?: TerminalReaderInfo[];
    error?: { message?: string };
  }>;
  connectReader: (reader: TerminalReaderInfo) => Promise<{ reader?: TerminalReaderInfo; error?: { message?: string } }>;
  disconnectReader: () => Promise<void>;
  collectPaymentMethod: (clientSecret: string) => Promise<{ paymentIntent?: { id: string }; error?: { message?: string } }>;
  processPayment: (paymentIntent: { id: string }) => Promise<{ paymentIntent?: { id: string; status?: string }; error?: { message?: string } }>;
  getConnectedReader: () => TerminalReaderInfo | null;
};

export function createWebTerminalProvider(options: TerminalProviderOptions): TerminalProvider {
  let terminal: TerminalInstance | null = null;
  let connectedReader: TerminalReaderInfo | null = null;

  const initTerminal = async () => {
    if (terminal) return terminal;
    const { loadStripeTerminal } = await import("@stripe/terminal-js");
    const StripeTerminalFactory = await loadStripeTerminal();
    terminal = StripeTerminalFactory.create({
      onFetchConnectionToken: fetchTerminalConnectionToken,
      onUnexpectedReaderDisconnect: () => {
        connectedReader = null;
        options.onUnexpectedDisconnect?.();
      },
    }) as TerminalInstance;
    return terminal;
  };

  return {
    getConnectedReader: () => connectedReader ?? terminal?.getConnectedReader() ?? null,

    async discoverAndConnect(_connectOptions?: DiscoverAndConnectOptions) {
      const t = await initTerminal();
      const discoverConfig: Record<string, unknown> = options.simulated
        ? { simulated: true }
        : { location: options.locationId };
      const discoverResult = await t.discoverReaders(discoverConfig);
      if (discoverResult.error) {
        throw new Error(discoverResult.error.message || "Reader discovery failed");
      }
      const readers = discoverResult.discoveredReaders || [];
      if (readers.length === 0) {
        throw new Error(options.simulated ? "No simulated reader found" : "No Wi‑Fi reader found at this location");
      }
      const connectResult = await t.connectReader(readers[0]);
      if (connectResult.error) {
        throw new Error(connectResult.error.message || "Could not connect reader");
      }
      connectedReader = connectResult.reader || readers[0];
      return connectedReader;
    },

    async disconnect() {
      if (terminal) await terminal.disconnectReader();
      connectedReader = null;
    },

    async collectAndProcess(clientSecret: string) {
      const t = await initTerminal();
      if (!t.getConnectedReader()) {
        await this.discoverAndConnect();
      }
      const collectResult = await t.collectPaymentMethod(clientSecret);
      if (collectResult.error) {
        throw new Error(collectResult.error.message || "Payment collection failed");
      }
      if (!collectResult.paymentIntent) {
        throw new Error("No payment intent returned");
      }
      const processResult = await t.processPayment(collectResult.paymentIntent);
      if (processResult.error) {
        throw new Error(processResult.error.message || "Payment processing failed");
      }
      const paymentIntentId = processResult.paymentIntent?.id || collectResult.paymentIntent.id;
      const reader = t.getConnectedReader();
      return {
        paymentIntentId,
        readerId: reader?.id || connectedReader?.id || null,
      };
    },
  };
}

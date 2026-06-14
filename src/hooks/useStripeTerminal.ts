import { useCallback, useRef, useState } from "react";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";

type TerminalReader = {
  id: string;
  label?: string;
  device_type?: string;
  status?: string;
};

type TerminalInstance = {
  discoverReaders: (config: Record<string, unknown>) => Promise<{ discoveredReaders?: TerminalReader[]; error?: { message?: string } }>;
  connectReader: (reader: TerminalReader) => Promise<{ reader?: TerminalReader; error?: { message?: string } }>;
  disconnectReader: () => Promise<void>;
  collectPaymentMethod: (clientSecret: string) => Promise<{ paymentIntent?: { id: string }; error?: { message?: string } }>;
  processPayment: (paymentIntent: { id: string }) => Promise<{ paymentIntent?: { id: string; status?: string }; error?: { message?: string } }>;
  getConnectedReader: () => TerminalReader | null;
};

export type TerminalStatus = "idle" | "initializing" | "discovering" | "connecting" | "connected" | "processing" | "error";

export function useStripeTerminal(options: { simulated: boolean; locationId?: string | null }) {
  const terminalRef = useRef<TerminalInstance | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [reader, setReader] = useState<TerminalReader | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConnectionToken = useCallback(async () => {
    const { data, error: err } = await invokeEdgeFunctionJson<{ secret?: string }>("stripe-terminal-pos", {
      action: "connection_token",
    });
    if (err || !data.secret) throw new Error(err?.message || "Could not get connection token");
    return data.secret;
  }, []);

  const initTerminal = useCallback(async () => {
    if (terminalRef.current) return terminalRef.current;
    setStatus("initializing");
    setError(null);
    try {
      const { loadStripeTerminal } = await import("@stripe/terminal-js");
      const StripeTerminalFactory = await loadStripeTerminal();
      const terminal = StripeTerminalFactory.create({
        onFetchConnectionToken: fetchConnectionToken,
        onUnexpectedReaderDisconnect: () => {
          setReader(null);
          setStatus("idle");
        },
      }) as TerminalInstance;
      terminalRef.current = terminal;
      setStatus("idle");
      return terminal;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Terminal init failed";
      setError(msg);
      setStatus("error");
      throw e;
    }
  }, [fetchConnectionToken]);

  const discoverAndConnect = useCallback(async () => {
    setError(null);
    setStatus("discovering");
    try {
      const terminal = await initTerminal();
      const discoverConfig: Record<string, unknown> = options.simulated
        ? { simulated: true }
        : { location: options.locationId };
      const discoverResult = await terminal.discoverReaders(discoverConfig);
      if (discoverResult.error) {
        throw new Error(discoverResult.error.message || "Reader discovery failed");
      }
      const readers = discoverResult.discoveredReaders || [];
      if (readers.length === 0) {
        throw new Error(options.simulated ? "No simulated reader found" : "No WisePad reader found nearby");
      }
      setStatus("connecting");
      const connectResult = await terminal.connectReader(readers[0]);
      if (connectResult.error) {
        throw new Error(connectResult.error.message || "Could not connect reader");
      }
      setReader(connectResult.reader || readers[0]);
      setStatus("connected");
      return connectResult.reader || readers[0];
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Reader connection failed";
      setError(msg);
      setStatus("error");
      throw e;
    }
  }, [initTerminal, options.locationId, options.simulated]);

  const disconnect = useCallback(async () => {
    if (terminalRef.current) {
      await terminalRef.current.disconnectReader();
    }
    setReader(null);
    setStatus("idle");
  }, []);

  const collectAndProcess = useCallback(
    async (clientSecret: string) => {
      setError(null);
      setStatus("processing");
      try {
        const terminal = await initTerminal();
        if (!terminal.getConnectedReader()) {
          await discoverAndConnect();
        }
        const collectResult = await terminal.collectPaymentMethod(clientSecret);
        if (collectResult.error) {
          throw new Error(collectResult.error.message || "Payment collection failed");
        }
        if (!collectResult.paymentIntent) {
          throw new Error("No payment intent returned");
        }
        const processResult = await terminal.processPayment(collectResult.paymentIntent);
        if (processResult.error) {
          throw new Error(processResult.error.message || "Payment processing failed");
        }
        setStatus("connected");
        return {
          paymentIntentId: processResult.paymentIntent?.id || collectResult.paymentIntent.id,
          readerId: terminal.getConnectedReader()?.id || reader?.id || null,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Payment failed";
        setError(msg);
        setStatus(reader ? "connected" : "error");
        throw e;
      }
    },
    [discoverAndConnect, initTerminal, reader?.id],
  );

  return {
    status,
    reader,
    error,
    discoverAndConnect,
    disconnect,
    collectAndProcess,
  };
}

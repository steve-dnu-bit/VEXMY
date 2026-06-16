import { useCallback, useEffect, useRef, useState } from "react";
import { createTerminalProvider, type TerminalProviderStatus } from "@/lib/terminal";
import { formatTerminalError } from "@/lib/terminal/formatTerminalError";
import type { TerminalReaderInfo } from "@/lib/terminal/types";

export type { TerminalProviderStatus };

export function useStripeTerminal(options: { simulated: boolean; locationId?: string | null }) {
  const providerRef = useRef(createTerminalProvider({
    simulated: options.simulated,
    locationId: options.locationId,
    onUnexpectedDisconnect: () => {
      setReader(null);
      setStatus("idle");
    },
  }));
  const [status, setStatus] = useState<TerminalProviderStatus>("idle");
  const [reader, setReader] = useState<TerminalReaderInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    providerRef.current = createTerminalProvider({
      simulated: options.simulated,
      locationId: options.locationId,
      onUnexpectedDisconnect: () => {
        setReader(null);
        setStatus("idle");
      },
    });
    setReader(null);
    setStatus("idle");
    setError(null);
  }, [options.locationId, options.simulated]);

  const discoverAndConnect = useCallback(async () => {
    setError(null);
    setStatus("discovering");
    try {
      setStatus("connecting");
      const connected = await providerRef.current.discoverAndConnect();
      setReader(connected);
      setStatus("connected");
      return connected;
    } catch (e) {
      const msg = formatTerminalError(e, "Reader connection failed");
      setError(msg);
      setStatus("error");
      throw e;
    }
  }, []);

  const disconnect = useCallback(async () => {
    await providerRef.current.disconnect();
    setReader(null);
    setStatus("idle");
  }, []);

  const collectAndProcess = useCallback(
    async (clientSecret: string) => {
      setError(null);
      setStatus("processing");
      try {
        if (!providerRef.current.getConnectedReader()) {
          await discoverAndConnect();
        }
        const result = await providerRef.current.collectAndProcess(clientSecret);
        setStatus("connected");
        return result;
      } catch (e) {
        const msg = formatTerminalError(e, "Payment failed");
        setError(msg);
        setStatus(reader ? "connected" : "error");
        throw e;
      }
    },
    [discoverAndConnect, reader],
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

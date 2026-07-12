import { useCallback, useEffect, useRef, useState } from "react";
import { createTerminalProvider, type TerminalProvider, type TerminalProviderStatus } from "@/lib/terminal";
import { formatTerminalError } from "@/lib/terminal/formatTerminalError";
import { getNativeConnectedReader } from "@/lib/terminal/getNativeConnectedReader";
import { abortTerminalOperation, isNativeTerminalInitialized } from "@/lib/terminal/nativeTerminalState";
import type { TerminalProviderOptions, TerminalReaderInfo } from "@/lib/terminal/types";

const PHONE_PAYMENTS_OPERATION_MS = 150_000;

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

export type { TerminalProviderStatus };

export function useStripeTerminal(options: {
  simulated: boolean;
  readerMode: import("@/lib/terminal/types").TerminalReaderMode;
  locationId?: string | null;
  onConnectionTokenError?: (message: string) => void;
  onReaderStatus?: (message: string) => void;
  onFirmwareUpdateChange?: (state: { active: boolean; progress: number; completed?: boolean }) => void;
}) {
  const [status, setStatus] = useState<TerminalProviderStatus>("idle");
  const [reader, setReader] = useState<TerminalReaderInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readerStatus, setReaderStatus] = useState<string | null>(null);
  const [firmwareUpdate, setFirmwareUpdate] = useState({ active: false, progress: 0 });

  const onConnectionTokenErrorRef = useRef(options.onConnectionTokenError);
  const onReaderStatusRef = useRef(options.onReaderStatus);
  const onFirmwareUpdateChangeRef = useRef(options.onFirmwareUpdateChange);
  const simulatedRef = useRef(options.simulated);
  const readerModeRef = useRef(options.readerMode);
  const providerRef = useRef<TerminalProvider | null>(null);

  onConnectionTokenErrorRef.current = options.onConnectionTokenError;
  onReaderStatusRef.current = options.onReaderStatus;
  onFirmwareUpdateChangeRef.current = options.onFirmwareUpdateChange;

  const buildProviderOptions = useCallback(
    (): TerminalProviderOptions => ({
      simulated: options.simulated,
      readerMode: options.readerMode,
      locationId: options.locationId,
      onUnexpectedDisconnect: () => {
        // Keep status messages; only clear connection when the provider confirms a real loss.
        setReader(null);
        setStatus("idle");
      },
      onConnectionTokenError: (message) => {
        setError(message);
        setStatus("error");
        setReaderStatus(null);
        onConnectionTokenErrorRef.current?.(message);
      },
      onReaderStatus: (message) => {
        setReaderStatus(message);
        onReaderStatusRef.current?.(message);
      },
      onFirmwareUpdateChange: (state) => {
        setFirmwareUpdate({ active: state.active, progress: state.progress });
        onFirmwareUpdateChangeRef.current?.(state);
      },
    }),
    [options.locationId, options.readerMode, options.simulated],
  );

  const ensureProvider = useCallback(async () => {
    const providerOptions = buildProviderOptions();
    if (!providerRef.current) {
      providerRef.current = await createTerminalProvider(providerOptions);
    } else {
      const { updateNativeTerminalProviderOptions } = await import("@/lib/terminal/nativeTerminalProvider");
      updateNativeTerminalProviderOptions(providerOptions);
    }
    return providerRef.current;
  }, [buildProviderOptions]);

  const syncReaderFromSdk = useCallback(async () => {
    const sdkReader = await getNativeConnectedReader();
    if (sdkReader) {
      setReader(sdkReader);
      setStatus("connected");
      return sdkReader;
    }
    return null;
  }, []);

  useEffect(() => {
    const simulatedChanged = simulatedRef.current !== options.simulated;
    const readerModeChanged = readerModeRef.current !== options.readerMode;
    simulatedRef.current = options.simulated;
    readerModeRef.current = options.readerMode;

    if (simulatedChanged || readerModeChanged) {
      providerRef.current = null;
      setReader(null);
      setStatus("idle");
      setError(null);
      setReaderStatus(null);
      setFirmwareUpdate({ active: false, progress: 0 });
    }
  }, [options.locationId, options.readerMode, options.simulated]);

  const discoverAndConnect = useCallback(async () => {
    setError(null);
    setStatus("discovering");
    try {
      const provider = await ensureProvider();
      setStatus("connecting");
      await withTimeout(
        provider.discoverAndConnect(),
        PHONE_PAYMENTS_OPERATION_MS,
        "Phone payments timed out. Allow Location for Velbok, turn Developer options OFF, check internet, then try again.",
      );
      const sdkReader = await syncReaderFromSdk();
      if (!sdkReader) {
        throw new Error(
          "Phone payments are not ready. Tap Enable phone payments and wait until connected.",
        );
      }
      setReader(sdkReader);
      setStatus("connected");
      return sdkReader;
    } catch (e) {
      const stillConnected = await syncReaderFromSdk();
      if (stillConnected) {
        setReader(stillConnected);
        setStatus("connected");
        return stillConnected;
      }
      const msg = formatTerminalError(e, "Reader connection failed");
      setError(msg);
      setStatus("error");
      throw new Error(msg);
    }
  }, [ensureProvider, syncReaderFromSdk]);

  const disconnect = useCallback(async () => {
    if (!providerRef.current) return;
    await providerRef.current.disconnect();
    setReader(null);
    setStatus("idle");
  }, []);

  const collectAndProcess = useCallback(
    async (clientSecret: string) => {
      if (firmwareUpdate.active) {
        throw new Error("WisePad firmware update in progress");
      }
      setError(null);
      setStatus("processing");
      try {
        const provider = await ensureProvider();
        let sdkReader = await syncReaderFromSdk();
        if (!sdkReader) {
          setStatus("connecting");
          await discoverAndConnect();
          sdkReader = await syncReaderFromSdk();
        }
        if (!sdkReader) {
          throw new Error(
            "Phone payments are not ready. Tap Enable phone payments before charging.",
          );
        }

        setStatus("processing");
        const result = await provider.collectAndProcess(clientSecret);
        await syncReaderFromSdk();
        setStatus("connected");
        return result;
      } catch (e) {
        const msg = formatTerminalError(e, "Payment failed");
        setError(msg);
        const stillConnected = await syncReaderFromSdk();
        setStatus(stillConnected ? "connected" : "error");
        throw new Error(msg);
      }
    },
    [discoverAndConnect, ensureProvider, syncReaderFromSdk, firmwareUpdate.active],
  );

  const updateReaderDisplay = useCallback(
    async (cart: import("@/lib/terminal/readerDisplay").ReaderDisplayCart) => {
      if (firmwareUpdate.active) return;

      const provider = providerRef.current ?? (await ensureProvider());
      if (!provider.updateReaderDisplay) return;

      const sdkReader = await syncReaderFromSdk();
      if (!sdkReader) {
        throw new Error("Reader not connected");
      }

      await provider.updateReaderDisplay(cart);
    },
    [ensureProvider, syncReaderFromSdk, firmwareUpdate.active],
  );

  const cancelConnect = useCallback(async () => {
    abortTerminalOperation();
    try {
      if (isNativeTerminalInitialized()) {
        const { StripeTerminal } = await import("@capacitor-community/stripe-terminal");
        await StripeTerminal.cancelDiscoverReaders().catch(() => undefined);
      }
      if (providerRef.current) {
        await providerRef.current.disconnect().catch(() => undefined);
      }
    } finally {
      setReader(null);
      setStatus("idle");
      setReaderStatus(null);
      setError(null);
    }
  }, []);

  return {
    status,
    reader,
    error,
    readerStatus,
    firmwareUpdate,
    discoverAndConnect,
    cancelConnect,
    disconnect,
    collectAndProcess,
    updateReaderDisplay,
  };
}

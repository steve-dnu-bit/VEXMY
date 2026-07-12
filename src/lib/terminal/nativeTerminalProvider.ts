import {
  StripeTerminal,
  TerminalConnectTypes,
  TerminalEventsEnum,
} from "@capacitor-community/stripe-terminal";
import { Capacitor } from "@capacitor/core";
import { discoverBluetoothReaders } from "@/lib/terminal/discoverBluetoothReaders";
import { discoverTapToPayReaders, formatTapToPayDiscoveryError } from "@/lib/terminal/discoverTapToPayReaders";
import { ensureTerminalLocation } from "@/lib/terminal/ensureTerminalLocation";
import {
  deliverTerminalConnectionToken,
  enqueueTerminalConnectionTokenDelivery,
  fetchTerminalConnectionToken,
  handleTerminalConnectionTokenFailure,
} from "@/lib/terminal/fetchConnectionToken";
import { fetchTerminalConfig } from "@/lib/terminal/fetchTerminalConfig";
import { formatTerminalError } from "@/lib/terminal/formatTerminalError";
import { initializeStripeTerminalWithTimeout } from "@/lib/terminal/ensureAndroidTerminalReady";
import { ensureIosReaderPermissions } from "@/lib/terminal/iosTerminalPermissions";
import { assertTapToPayEnvironmentReady } from "@/lib/terminal/tapToPayReadiness";
import { nativePlatform, stripeTerminalIsTestMode } from "@/lib/platform";
import { setCachedTerminalLocationId, getCachedTerminalLocationId } from "@/lib/terminal/terminalLocationCache";
import { clearNativeReaderDisplay, updateNativeReaderDisplay, type ReaderDisplayCart } from "@/lib/terminal/readerDisplay";
import { isNativeTerminalInitialized, isReaderFirmwareUpdating, setNativeTerminalInitialized, setReaderFirmwareUpdate, beginTerminalOperation, isTerminalOperationAborted } from "@/lib/terminal/nativeTerminalState";
import {
  clearTerminalConnectionEstablished,
  formatConnectionStatusForStaff,
  hasTerminalConnectionBeenEstablished,
  markTerminalConnectionEstablished,
} from "@/lib/terminal/terminalConnectionStatus";
import { waitForTerminalConnected } from "@/lib/terminal/waitForTerminalConnected";
import type { TerminalProvider, TerminalProviderOptions, TerminalReaderInfo } from "@/lib/terminal/types";

let connectionTokenListenerRegistered = false;
let terminalEventListenersRegistered = false;
let cachedIsTest: boolean | null = null;
let latestProviderOptions: TerminalProviderOptions | null = null;
let unexpectedDisconnectHandler: (() => void) | null = null;

function activeOptions(): TerminalProviderOptions {
  if (!latestProviderOptions) {
    throw new Error("Terminal is not configured. Open POS checkout and try again.");
  }
  return latestProviderOptions;
}

/** Keep callbacks and location in sync when the React hook updates options. */
export function updateNativeTerminalProviderOptions(options: TerminalProviderOptions): void {
  latestProviderOptions = options;
  unexpectedDisconnectHandler = options.onUnexpectedDisconnect ?? null;
}

async function resolveTerminalIsTest(): Promise<boolean> {
  const flag = import.meta.env.VITE_STRIPE_TERMINAL_TEST_MODE;
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;

  if (cachedIsTest !== null) return cachedIsTest;
  try {
    const config = await fetchTerminalConfig();
    cachedIsTest = config.isTest;
    return config.isTest;
  } catch {
    return stripeTerminalIsTestMode();
  }
}

function formatReaderInputMessage(options: string[] | undefined): string | null {
  if (!options?.length) return null;
  const labels = options.map((option) =>
    option
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()),
  );
  return labels.join(" · ");
}

function notifyFirmwareUpdate(active: boolean, progress = 0): void {
  setReaderFirmwareUpdate(active, progress);
  latestProviderOptions?.onFirmwareUpdateChange?.({
    active,
    progress: active ? progress : 0,
  });
}

async function registerTerminalListeners(): Promise<void> {
  if (connectionTokenListenerRegistered) return;

  await StripeTerminal.addListener(TerminalEventsEnum.RequestedConnectionToken, async () => {
    try {
      const locationId = latestProviderOptions?.locationId;
      await enqueueTerminalConnectionTokenDelivery(locationId);
    } catch (error) {
      console.error("Terminal connection token failed", error);
      await deliverTerminalConnectionToken("").catch(() => undefined);
      if (!isReaderFirmwareUpdating()) {
        await handleTerminalConnectionTokenFailure(error, latestProviderOptions?.onConnectionTokenError);
      }
    }
  });

  await StripeTerminal.addListener(TerminalEventsEnum.UnexpectedReaderDisconnect, () => {
    sdkConnectedReader = null;
    unexpectedDisconnectHandler?.();
  });

  await StripeTerminal.addListener(TerminalEventsEnum.ConnectedReader, async () => {
    notifyFirmwareUpdate(false);
    markTerminalConnectionEstablished();
    await refreshConnectedReaderFromSdk();
    latestProviderOptions?.onReaderStatus?.("Tap to Pay ready");
  });

  connectionTokenListenerRegistered = true;
}

/** Register the connection-token listener as early as possible (before initialize). */
export async function ensureNativeTerminalTokenListener(): Promise<void> {
  await registerTerminalListeners();
}

async function registerTerminalEventListeners(): Promise<void> {
  if (terminalEventListenersRegistered) return;

  await StripeTerminal.addListener(TerminalEventsEnum.RequestReaderInput, ({ options, message }) => {
    const status = message?.trim() || formatReaderInputMessage(options);
    if (status) latestProviderOptions?.onReaderStatus?.(status);
  });

  await StripeTerminal.addListener(TerminalEventsEnum.RequestDisplayMessage, ({ message }) => {
    if (message) latestProviderOptions?.onReaderStatus?.(String(message));
  });

  await StripeTerminal.addListener(TerminalEventsEnum.PaymentStatusChange, ({ status }) => {
    if (status) latestProviderOptions?.onReaderStatus?.(String(status));
  });

  await StripeTerminal.addListener(TerminalEventsEnum.Failed, (info) => {
    if (info?.message) latestProviderOptions?.onReaderStatus?.(info.message);
  });

  await StripeTerminal.addListener(TerminalEventsEnum.ConnectionStatusChange, ({ status }) => {
    const statusText = status ? String(status) : "";
    if (!statusText) return;

    const staffMessage = formatConnectionStatusForStaff(statusText);
    if (staffMessage) latestProviderOptions?.onReaderStatus?.(staffMessage);

    if (/^connected$/i.test(statusText.trim()) || (statusText.toUpperCase().includes("CONNECTED") && !statusText.toUpperCase().includes("NOT"))) {
      markTerminalConnectionEstablished();
      return;
    }

    // Only treat NOT_CONNECTED as a disconnect after we were connected — startup always begins NOT_CONNECTED.
    if (/notConnected|NOT_CONNECTED/i.test(statusText) && hasTerminalConnectionBeenEstablished()) {
      sdkConnectedReader = null;
      clearTerminalConnectionEstablished();
      unexpectedDisconnectHandler?.();
    }
  });

  await StripeTerminal.addListener(TerminalEventsEnum.ReportAvailableUpdate, () => {
    notifyFirmwareUpdate(true, 0);
  });

  await StripeTerminal.addListener(TerminalEventsEnum.StartInstallingUpdate, () => {
    notifyFirmwareUpdate(true, 0);
  });

  await StripeTerminal.addListener(TerminalEventsEnum.ReaderSoftwareUpdateProgress, ({ progress }) => {
    const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    notifyFirmwareUpdate(true, percent);
  });

  await StripeTerminal.addListener(TerminalEventsEnum.FinishInstallingUpdate, (args) => {
    if ("error" in args && args.error) {
      notifyFirmwareUpdate(false);
      latestProviderOptions?.onReaderStatus?.(`Reader update failed: ${args.error}`);
      return;
    }
    notifyFirmwareUpdate(false);
    latestProviderOptions?.onFirmwareUpdateChange?.({ active: false, progress: 100, completed: true });
  });

  await StripeTerminal.addListener(TerminalEventsEnum.DisconnectedReader, ({ reason }) => {
    sdkConnectedReader = null;
    clearTerminalConnectionEstablished();
    unexpectedDisconnectHandler?.();
    if (reason) {
      const reasonText = String(reason).replace(/_/g, " ");
      latestProviderOptions?.onReaderStatus?.(`Reader disconnected (${reasonText})`);
    }
  });

  await StripeTerminal.addListener(TerminalEventsEnum.ReaderReconnectStarted, () => {
    latestProviderOptions?.onReaderStatus?.("Reconnecting to WisePad…");
  });

  await StripeTerminal.addListener(TerminalEventsEnum.ReaderReconnectSucceeded, async () => {
    await refreshConnectedReaderFromSdk();
    latestProviderOptions?.onReaderStatus?.("Reader reconnected");
  });

  await StripeTerminal.addListener(TerminalEventsEnum.ReaderReconnectFailed, () => {
    latestProviderOptions?.onReaderStatus?.(
      "Reader reconnect failed — check phone internet (try mobile data), keep reader on and near phone",
    );
  });

  terminalEventListenersRegistered = true;
}

async function ensureNativeTerminalInitialized(): Promise<void> {
  if (!Capacitor.isPluginAvailable("StripeTerminal")) {
    throw new Error(
      "Stripe Terminal is missing from this iOS build. On your Mac run npm run ios:prepare, then create a new Xcode archive — do not upload a build made after ios:build-lite.",
    );
  }

  activeOptions();

  await registerTerminalListeners();
  await registerTerminalEventListeners();

  if (isNativeTerminalInitialized()) return;

  const options = latestProviderOptions;
  if (options?.readerMode === "tap_to_pay" && !options.simulated) {
    await assertTapToPayEnvironmentReady();
  }

  const isTest = await resolveTerminalIsTest();
  latestProviderOptions?.onReaderStatus?.(
    isTest ? "Starting phone payments (Stripe test mode)…" : "Starting phone payments…",
  );

  await initializeStripeTerminalWithTimeout(isTest, options?.readerMode);
  await new Promise((resolve) => window.setTimeout(resolve, 400));
  setNativeTerminalInitialized(true);
}

function mapReader(reader: { serialNumber?: string; label?: string; deviceType?: string; status?: string }): TerminalReaderInfo {
  return {
    id: reader.serialNumber || reader.label || "reader",
    label: reader.label,
    device_type: reader.deviceType,
    status: reader.status,
  };
}

/** Shared across provider instances — SDK is source of truth for connection state. */
let sdkConnectedReader: TerminalReaderInfo | null = null;

async function refreshConnectedReaderFromSdk(): Promise<TerminalReaderInfo | null> {
  if (!isNativeTerminalInitialized()) return sdkConnectedReader;
  try {
    const { reader } = await StripeTerminal.getConnectedReader();
    if (!reader) {
      sdkConnectedReader = null;
      return null;
    }
    sdkConnectedReader = mapReader(reader);
    return sdkConnectedReader;
  } catch {
    return sdkConnectedReader;
  }
}

function wisePadNotFoundMessage(): string {
  return nativePlatform() === "ios"
    ? "No WisePad found after scanning for 30 seconds. Turn the reader off and on, keep it within 2 metres, enable iPhone Bluetooth and Location for Velbok, and do not pair the reader in Settings → Bluetooth — only connect through this app. If the reader is new, register its serial number in Stripe Dashboard → Terminal → Readers first. Test readers only work when your Stripe account uses test keys (sk_test_)."
    : "No WisePad found after scanning for 30 seconds. Turn the reader off and on, keep it within 2 metres, enable phone Bluetooth and Location (GPS), and do not pair it in Android Bluetooth settings — only connect through this app. If the reader is new, register its serial number in Stripe Dashboard → Terminal → Readers first. Test readers only work when your Stripe account uses test keys (sk_test_).";
}

const TAP_TO_PAY_WAITING_MESSAGE = "Ask the customer to hold their card or phone near this device…";
const WISEPAD_WAITING_MESSAGE = "Waiting for card on reader…";

const TAP_TO_PAY_CONNECT_TIMEOUT_MS = 90_000;
const TAP_TO_PAY_CONNECT_CONFIRM_MS = 25_000;

function withOperationTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
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

export function createNativeTerminalProvider(options: TerminalProviderOptions): TerminalProvider {
  latestProviderOptions = options;
  unexpectedDisconnectHandler = options.onUnexpectedDisconnect ?? null;

  let lastDisplayCart: ReaderDisplayCart | null = null;

  const pushDisplay = async (cart: ReaderDisplayCart) => {
    const opts = activeOptions();
    if (isReaderFirmwareUpdating()) return;
    if (opts.readerMode === "tap_to_pay" && !opts.simulated) return;
    lastDisplayCart = cart;
    const connected = await refreshConnectedReaderFromSdk();
    if (!connected) return;
    await updateNativeReaderDisplay(cart);
  };

  return {
    getConnectedReader: () => sdkConnectedReader,

    async updateReaderDisplay(cart) {
      await pushDisplay(cart);
    },

    async discoverAndConnect() {
      const options = activeOptions();
      try {
        beginTerminalOperation();

        if (nativePlatform() === "ios" && !options.simulated) {
          await ensureIosReaderPermissions(options.readerMode);
        }

        let locationId = options.locationId?.trim() || getCachedTerminalLocationId() || "";
        if (!locationId) {
          locationId = await ensureTerminalLocation();
        }
        if (!locationId) {
          throw new Error("Terminal location is not set up. Create one in Admin → POS checkout first.");
        }
        setCachedTerminalLocationId(locationId);

        if (options.readerMode === "tap_to_pay" && !options.simulated) {
          await assertTapToPayEnvironmentReady();
        }

        await ensureNativeTerminalInitialized();

        const alreadyConnected = await refreshConnectedReaderFromSdk();
        if (alreadyConnected) {
          markTerminalConnectionEstablished();
          return alreadyConnected;
        }

        if (options.readerMode === "tap_to_pay" && !options.simulated) {
          options.onReaderStatus?.("Checking Stripe connection…");
          await fetchTerminalConnectionToken(locationId);
        }

        const readers = options.simulated
          ? (await StripeTerminal.discoverReaders({
              type: TerminalConnectTypes.Simulated,
              locationId: locationId || "",
            })).readers ?? []
          : options.readerMode === "tap_to_pay"
            ? await discoverTapToPayReaders(locationId, (message) => options.onReaderStatus?.(message))
            : await discoverBluetoothReaders(locationId);

        if (!readers.length) {
          if (options.simulated) throw new Error("No simulated reader found");
          if (options.readerMode === "tap_to_pay") {
            throw new Error(formatTapToPayDiscoveryError("Tap to Pay reader was not found on this device."));
          }
          throw new Error(wisePadNotFoundMessage());
        }

        const connectOnce = async (activeLocationId: string) => {
          options.onReaderStatus?.(
            options.readerMode === "tap_to_pay" && !options.simulated
              ? "Activating Tap to Pay… first setup can take 1–2 minutes."
              : "Connecting to reader…",
          );
          const connectPayload: {
            reader: (typeof readers)[0];
            autoReconnectOnUnexpectedDisconnect: boolean;
            locationId: string;
            tapToPay?: boolean;
            discoveryMethod?: string;
            merchantDisplayName?: string;
          } = {
            reader: readers[0],
            // iOS Tap to Pay: avoid auto-reconnect config issues; reconnect manually if needed.
            autoReconnectOnUnexpectedDisconnect:
              options.readerMode === "tap_to_pay" && nativePlatform() === "ios" ? false : true,
            locationId: activeLocationId,
          };
          if (options.readerMode === "tap_to_pay") {
            connectPayload.tapToPay = true;
            connectPayload.discoveryMethod = "tap-to-pay";
          }
          const connectPromise = StripeTerminal.connectReader(
            connectPayload as Parameters<typeof StripeTerminal.connectReader>[0] & {
              locationId: string;
              tapToPay?: boolean;
              discoveryMethod?: string;
            },
          );

          const timeoutMs =
            options.readerMode === "tap_to_pay" && !options.simulated
              ? TAP_TO_PAY_CONNECT_TIMEOUT_MS
              : 60_000;

          await withOperationTimeout(
            connectPromise,
            timeoutMs,
            "Tap to Pay connection timed out. Keep Velbok in the foreground, allow Location, and try mobile data.",
          );
        };

        try {
          await connectOnce(locationId);
        } catch (connectError) {
          const message = formatTerminalError(connectError, "");
          if (/no such location|resource_missing|invalid location/i.test(message)) {
            locationId = await ensureTerminalLocation({ forceRecreate: true });
            setCachedTerminalLocationId(locationId);
            await connectOnce(locationId);
          } else {
            throw connectError;
          }
        }

        await StripeTerminal.cancelDiscoverReaders().catch(() => undefined);

        const mappedReader = mapReader(readers[0]);
        const connectWaitMs =
          options.readerMode === "tap_to_pay" && !options.simulated
            ? TAP_TO_PAY_CONNECT_CONFIRM_MS
            : 30_000;

        const connectedReader = await waitForTerminalConnected(
          refreshConnectedReaderFromSdk,
          connectWaitMs,
          (message) => options.onReaderStatus?.(message),
          options.readerMode === "tap_to_pay" && !options.simulated ? mappedReader : undefined,
        );
        sdkConnectedReader = connectedReader;

        if (lastDisplayCart) {
          await new Promise((resolve) => window.setTimeout(resolve, 600));
          try {
            await pushDisplay(lastDisplayCart);
          } catch (displayError) {
            console.warn("Reader display update after connect failed", displayError);
          }
        }

        return connectedReader;
      } catch (error) {
        await StripeTerminal.cancelDiscoverReaders().catch(() => undefined);
        throw new Error(formatTerminalError(error, "Reader connection failed"));
      }
    },

    async disconnect() {
      await clearNativeReaderDisplay();
      await StripeTerminal.disconnectReader();
      sdkConnectedReader = null;
      clearTerminalConnectionEstablished();
    },

    async collectAndProcess(clientSecret: string) {
      const options = activeOptions();
      let locationId = options.locationId?.trim() || getCachedTerminalLocationId() || "";
      if (!locationId) {
        locationId = await ensureTerminalLocation();
      }
      setCachedTerminalLocationId(locationId);

      await ensureNativeTerminalInitialized();

      try {
        let connected = await refreshConnectedReaderFromSdk();
        if (!connected) {
          await this.discoverAndConnect();
          connected = await refreshConnectedReaderFromSdk();
        }
        if (!connected) {
          throw new Error(
            "Stripe Terminal is not connected. Tap Enable Tap to Pay, wait until connected, then try again.",
          );
        }

        if (lastDisplayCart) {
          try {
            await pushDisplay(lastDisplayCart);
          } catch (displayError) {
            console.warn("Reader display update before payment failed", displayError);
          }
        }

        options.onReaderStatus?.(
          options.readerMode === "tap_to_pay" && !options.simulated
            ? TAP_TO_PAY_WAITING_MESSAGE
            : WISEPAD_WAITING_MESSAGE,
        );
        await StripeTerminal.collectPaymentMethod({ paymentIntent: clientSecret });
        options.onReaderStatus?.("Confirming payment…");
        await StripeTerminal.confirmPaymentIntent();

        await refreshConnectedReaderFromSdk();

        const paymentIntentId = extractPaymentIntentId(clientSecret);
        return {
          paymentIntentId,
          readerId: sdkConnectedReader?.id || null,
        };
      } catch (error) {
        throw new Error(formatTerminalError(error, "Payment failed"));
      }
    },
  };
}

function extractPaymentIntentId(clientSecret: string): string {
  const prefix = "pi_";
  const start = clientSecret.indexOf(prefix);
  if (start === -1) return clientSecret;
  const rest = clientSecret.slice(start);
  const end = rest.indexOf("_secret");
  return end === -1 ? rest : rest.slice(0, end);
}

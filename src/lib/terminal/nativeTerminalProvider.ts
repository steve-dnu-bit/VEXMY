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
  isStripeConnectedStatus,
  isStripeNotConnectedStatus,
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
  const normalized = options.map((option) => option.trim().toUpperCase());
  const hasSwipe = normalized.some((o) => o.includes("SWIPE"));
  const hasInsert = normalized.some((o) => o.includes("INSERT"));
  const hasTap = normalized.some((o) => o.includes("TAP"));

  const actions: string[] = [];
  if (hasTap) actions.push("tap");
  if (hasInsert) actions.push("insert");
  if (hasSwipe) actions.push("swipe");
  if (!actions.length) {
    return "Present the card on the WisePad…";
  }
  if (actions.length === 1) {
    return `Ask the customer to ${actions[0]} their card on the WisePad…`;
  }
  if (actions.length === 2) {
    return `Ask the customer to ${actions[0]} or ${actions[1]} their card on the WisePad…`;
  }
  return `Ask the customer to tap, insert, or swipe their card on the WisePad…`;
}

function readerInputStatusFromEvent(options: string[] | undefined, message?: string | null): string | null {
  const fromOptions = formatReaderInputMessage(options);
  if (fromOptions) return fromOptions;

  const raw = message?.trim() ?? "";
  // Native debug strings like "SCPReaderInputOption(rawValue: 6)" — decode bit flags.
  const match = /rawValue:\s*(\d+)/i.exec(raw);
  if (match) {
    const value = Number(match[1]);
    const decoded: string[] = [];
    if (value & 1) decoded.push("SWIPE");
    if (value & 2) decoded.push("INSERT");
    if (value & 4) decoded.push("TAP");
    return formatReaderInputMessage(decoded) || "Waiting for card on reader…";
  }
  if (/SCPReaderInputOption|ReaderInputOption/i.test(raw)) {
    return "Waiting for card on reader…";
  }
  return raw || null;
}

function notifyFirmwareUpdate(active: boolean, progress = 0): void {
  setReaderFirmwareUpdate(active, progress);
  latestProviderOptions?.onFirmwareUpdateChange?.({
    active,
    progress: active ? progress : 0,
  });
}

/** Prevent optional firmware install from starting while a card payment is in flight. */
let paymentCollectionInFlight = false;
/** True while discover/connect is running — ignore transient disconnect noise. */
let readerConnectInFlight = false;
/** After a successful connect, ignore brief BT/firmware disconnect blips. */
let ignoreDisconnectsUntilMs = 0;
/** Suppress setReaderDisplay briefly after connect — it drops WisePad BT sessions. */
let suppressReaderDisplayUntilMs = 0;

function beginConnectionHold(ms = 12_000): void {
  ignoreDisconnectsUntilMs = Math.max(ignoreDisconnectsUntilMs, Date.now() + ms);
}

function suppressReaderDisplay(ms = 8_000): void {
  suppressReaderDisplayUntilMs = Math.max(suppressReaderDisplayUntilMs, Date.now() + ms);
}

function shouldIgnoreDisconnectEvents(): boolean {
  return (
    readerConnectInFlight ||
    isReaderFirmwareUpdating() ||
    paymentCollectionInFlight ||
    Date.now() < ignoreDisconnectsUntilMs
  );
}

function handleReaderLost(reason?: string): void {
  if (shouldIgnoreDisconnectEvents()) {
    if (reason) {
      latestProviderOptions?.onReaderStatus?.(
        `Reader signal dropped briefly (${reason}) — keeping session, waiting to recover…`,
      );
    }
    return;
  }
  sdkConnectedReader = null;
  clearTerminalConnectionEstablished();
  unexpectedDisconnectHandler?.();
  if (reason) {
    latestProviderOptions?.onReaderStatus?.(`Reader disconnected (${reason})`);
  }
}

/**
 * Optional WisePad updates must be installed manually.
 * Auto-calling installAvailableUpdate during/after connect has crashed the iOS app
 * (disconnect + install overlapping connectReader).
 */
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
    handleReaderLost("unexpected");
  });

  await StripeTerminal.addListener(TerminalEventsEnum.ConnectedReader, async () => {
    // Do not clear firmware state here — required updates often install during connect.
    markTerminalConnectionEstablished();
    beginConnectionHold(15_000);
    await refreshConnectedReaderFromSdk();
    const mode = latestProviderOptions?.readerMode;
    if (!isReaderFirmwareUpdating()) {
      latestProviderOptions?.onReaderStatus?.(
        mode === "tap_to_pay" ? "Tap to Pay ready" : "WisePad connected",
      );
    }
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
    const status = readerInputStatusFromEvent(options, message);
    if (status) latestProviderOptions?.onReaderStatus?.(status);
  });

  await StripeTerminal.addListener(TerminalEventsEnum.RequestDisplayMessage, ({ message }) => {
    const text = message ? String(message) : "";
    if (!text) return;
    if (/^\d+$/.test(text) || /rawValue|SCPReader/i.test(text)) {
      latestProviderOptions?.onReaderStatus?.("Follow the prompts on the WisePad…");
      return;
    }
    latestProviderOptions?.onReaderStatus?.(text);
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

    const mode = latestProviderOptions?.readerMode ?? "tap_to_pay";
    const staffMessage = formatConnectionStatusForStaff(statusText, mode);
    if (staffMessage) latestProviderOptions?.onReaderStatus?.(staffMessage);

    if (isStripeConnectedStatus(statusText)) {
      markTerminalConnectionEstablished();
      beginConnectionHold(15_000);
      void refreshConnectedReaderFromSdk();
      return;
    }

    if (isStripeNotConnectedStatus(statusText) && hasTerminalConnectionBeenEstablished()) {
      handleReaderLost("not connected");
    }
  });

  // Optional updates: report only. Never auto-install — races with connect and crashes iOS.
  await StripeTerminal.addListener(TerminalEventsEnum.ReportAvailableUpdate, () => {
    latestProviderOptions?.onReaderStatus?.(
      "WisePad optional update available. You can keep taking payments.",
    );
  });

  await StripeTerminal.addListener(TerminalEventsEnum.StartInstallingUpdate, () => {
    notifyFirmwareUpdate(true, 0);
    beginConnectionHold(120_000);
    latestProviderOptions?.onReaderStatus?.(
      "Installing WisePad firmware… keep Velbok open, phone unlocked, reader powered on and nearby.",
    );
  });

  await StripeTerminal.addListener(TerminalEventsEnum.ReaderSoftwareUpdateProgress, (payload) => {
    const raw = typeof payload?.progress === "number" ? payload.progress : Number(payload?.progress);
    if (!Number.isFinite(raw)) return;
    const percent = raw > 1 ? Math.round(Math.min(100, raw)) : Math.round(Math.max(0, Math.min(1, raw)) * 100);
    notifyFirmwareUpdate(true, percent);
    beginConnectionHold(120_000);
    latestProviderOptions?.onReaderStatus?.(`Installing WisePad firmware… ${percent}%`);
  });

  await StripeTerminal.addListener(TerminalEventsEnum.FinishInstallingUpdate, (args) => {
    if ("error" in args && args.error) {
      notifyFirmwareUpdate(false);
      latestProviderOptions?.onReaderStatus?.(`Reader update failed: ${args.error}`);
      return;
    }
    notifyFirmwareUpdate(false);
    beginConnectionHold(20_000);
    latestProviderOptions?.onReaderStatus?.("WisePad firmware update complete — stay on this screen.");
    latestProviderOptions?.onFirmwareUpdateChange?.({ active: false, progress: 100, completed: true });
    void refreshConnectedReaderFromSdk();
  });

  await StripeTerminal.addListener(TerminalEventsEnum.DisconnectedReader, ({ reason }) => {
    const reasonText = reason ? String(reason).replace(/_/g, " ") : "disconnected";
    handleReaderLost(reasonText);
  });

  await StripeTerminal.addListener(TerminalEventsEnum.ReaderReconnectStarted, () => {
    beginConnectionHold(30_000);
    latestProviderOptions?.onReaderStatus?.("Reconnecting to WisePad… keep the reader nearby.");
  });

  await StripeTerminal.addListener(TerminalEventsEnum.ReaderReconnectSucceeded, async () => {
    markTerminalConnectionEstablished();
    beginConnectionHold(15_000);
    await refreshConnectedReaderFromSdk();
    latestProviderOptions?.onReaderStatus?.("WisePad reconnected");
  });

  await StripeTerminal.addListener(TerminalEventsEnum.ReaderReconnectFailed, () => {
    ignoreDisconnectsUntilMs = 0;
    latestProviderOptions?.onReaderStatus?.(
      "Reader reconnect failed — keep reader on and near phone, then tap Connect again.",
    );
    handleReaderLost("reconnect failed");
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

const TAP_TO_PAY_CONNECT_TIMEOUT_MS = 180_000;
const TAP_TO_PAY_CONNECT_CONFIRM_MS = 45_000;

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
    if (Date.now() < suppressReaderDisplayUntilMs) return;
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
      readerConnectInFlight = true;
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

        options.onReaderStatus?.(
          options.readerMode === "bluetooth" && !options.simulated
            ? "Searching for WisePad…"
            : "Searching for reader…",
        );

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

        // Let discovery cancel settle before connect — overlapping commands crash Stripe Terminal on iOS.
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        beginConnectionHold(20_000);

        const connectOnce = async (activeLocationId: string) => {
          options.onReaderStatus?.(
            options.readerMode === "tap_to_pay" && !options.simulated
              ? "Activating Tap to Pay… first setup can take 1–2 minutes. Keep Velbok open."
              : "Connecting to WisePad… keep the reader nearby.",
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
            // WisePad needs auto-reconnect for brief BT drops; Tap to Pay stays manual.
            autoReconnectOnUnexpectedDisconnect: options.readerMode === "bluetooth",
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
              : 90_000;

          await withOperationTimeout(
            connectPromise,
            timeoutMs,
            options.readerMode === "bluetooth"
              ? "WisePad connection timed out. Keep the reader powered on and within 1 metre, then try again."
              : "Tap to Pay connection timed out. Keep Velbok in the foreground, allow Location, and try mobile data.",
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

        // Discovery was already cancelled in discoverBluetoothReaders/discoverTapToPayReaders.
        // Do not cancel again after connect — that can drop the live WisePad session on iOS.

        const mappedReader = mapReader(readers[0]);
        sdkConnectedReader = mappedReader;
        markTerminalConnectionEstablished();
        beginConnectionHold(20_000);

        const connectWaitMs =
          options.readerMode === "tap_to_pay" && !options.simulated
            ? TAP_TO_PAY_CONNECT_CONFIRM_MS
            : 20_000;

        const connectedReader = await waitForTerminalConnected(
          refreshConnectedReaderFromSdk,
          connectWaitMs,
          (message) => options.onReaderStatus?.(message),
          mappedReader,
        );
        sdkConnectedReader = connectedReader;
        markTerminalConnectionEstablished();
        beginConnectionHold(20_000);
        suppressReaderDisplay(10_000);
        options.onReaderStatus?.(
          options.readerMode === "bluetooth" ? "WisePad connected" : "Tap to Pay ready",
        );

        // Never push cart display immediately after WisePad connect — it drops the BT session.
        return connectedReader;
      } catch (error) {
        await StripeTerminal.cancelDiscoverReaders().catch(() => undefined);
        throw new Error(formatTerminalError(error, "Reader connection failed"));
      } finally {
        readerConnectInFlight = false;
      }
    },

    async disconnect() {
      try {
        await clearNativeReaderDisplay().catch(() => undefined);
        await StripeTerminal.cancelCollectPaymentMethod().catch(() => undefined);
        await StripeTerminal.disconnectReader();
      } finally {
        sdkConnectedReader = null;
        clearTerminalConnectionEstablished();
      }
    },

    async collectAndProcess(clientSecret: string) {
      const options = activeOptions();
      let locationId = options.locationId?.trim() || getCachedTerminalLocationId() || "";
      if (!locationId) {
        locationId = await ensureTerminalLocation();
      }
      setCachedTerminalLocationId(locationId);

      await ensureNativeTerminalInitialized();

      if (isReaderFirmwareUpdating()) {
        throw new Error(
          "WisePad firmware update is still running. Wait until it finishes, then charge again.",
        );
      }

      paymentCollectionInFlight = true;
      try {
        let connected = await refreshConnectedReaderFromSdk();
        if (!connected) {
          await this.discoverAndConnect();
          connected = await refreshConnectedReaderFromSdk();
        }
        if (!connected) {
          throw new Error(
            "Stripe Terminal is not connected. Connect the WisePad (or Tap to Pay), wait until connected, then try again.",
          );
        }

        // Avoid setReaderDisplay immediately before collect — overlapping Terminal commands
        // after a firmware update can crash or hang the native SDK. Clear any cart screen first.
        await clearNativeReaderDisplay().catch(() => undefined);
        await StripeTerminal.cancelCollectPaymentMethod().catch(() => undefined);

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
        await StripeTerminal.cancelCollectPaymentMethod().catch(() => undefined);
        throw new Error(formatTerminalError(error, "Payment failed"));
      } finally {
        paymentCollectionInFlight = false;
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

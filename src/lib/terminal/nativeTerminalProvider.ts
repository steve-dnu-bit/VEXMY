import {
  StripeTerminal,
  TerminalConnectTypes,
  TerminalEventsEnum,
} from "@capacitor-community/stripe-terminal";
import { discoverBluetoothReaders } from "@/lib/terminal/discoverBluetoothReaders";
import { ensureTerminalLocation } from "@/lib/terminal/ensureTerminalLocation";
import { fetchTerminalConnectionToken } from "@/lib/terminal/fetchConnectionToken";
import { fetchTerminalConfig } from "@/lib/terminal/fetchTerminalConfig";
import { formatTerminalError } from "@/lib/terminal/formatTerminalError";
import { stripeTerminalIsTestMode } from "@/lib/platform";
import type { TerminalProvider, TerminalProviderOptions, TerminalReaderInfo } from "@/lib/terminal/types";

let nativeInitialized = false;
let connectionTokenListenerRegistered = false;
let unexpectedDisconnectHandler: (() => void) | null = null;
let cachedIsTest: boolean | null = null;

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

async function ensureNativeTerminalInitialized(onUnexpectedDisconnect?: () => void): Promise<void> {
  unexpectedDisconnectHandler = onUnexpectedDisconnect ?? null;
  if (nativeInitialized) return;

  if (!connectionTokenListenerRegistered) {
    await StripeTerminal.addListener(TerminalEventsEnum.RequestedConnectionToken, async () => {
      try {
        const token = await fetchTerminalConnectionToken();
        await StripeTerminal.setConnectionToken({ token });
      } catch {
        /* SDK will retry token fetch */
      }
    });
    await StripeTerminal.addListener(TerminalEventsEnum.UnexpectedReaderDisconnect, () => {
      unexpectedDisconnectHandler?.();
    });
    connectionTokenListenerRegistered = true;
  }

  await StripeTerminal.initialize({ isTest: await resolveTerminalIsTest() });
  nativeInitialized = true;
}

function mapReader(reader: { serialNumber?: string; label?: string; deviceType?: string; status?: string }): TerminalReaderInfo {
  return {
    id: reader.serialNumber || reader.label || "reader",
    label: reader.label,
    device_type: reader.deviceType,
    status: reader.status,
  };
}

const WISEPAD_NOT_FOUND_MESSAGE =
  "No WisePad found after scanning for 30 seconds. Turn the reader off and on, keep it within 2 metres, enable phone Bluetooth and Location (GPS), and do not pair it in Android Bluetooth settings — only connect through this app. If the reader is new, register its serial number in Stripe Dashboard → Terminal → Readers first. Test readers only work when your Stripe account uses test keys (sk_test_).";

export function createNativeTerminalProvider(options: TerminalProviderOptions): TerminalProvider {
  let connectedReader: TerminalReaderInfo | null = null;

  return {
    getConnectedReader: () => connectedReader,

    async discoverAndConnect() {
      await ensureNativeTerminalInitialized(() => {
        connectedReader = null;
        options.onUnexpectedDisconnect?.();
      });

      try {
        let locationId = options.locationId?.trim() || "";
        locationId = await ensureTerminalLocation();

        const readers = options.simulated
          ? (await StripeTerminal.discoverReaders({
              type: TerminalConnectTypes.Simulated,
              locationId: locationId || "",
            })).readers ?? []
          : await discoverBluetoothReaders(locationId);

        if (!readers.length) {
          if (options.simulated) throw new Error("No simulated reader found");
          throw new Error(WISEPAD_NOT_FOUND_MESSAGE);
        }

        const connectOnce = async (activeLocationId: string) => {
          await StripeTerminal.connectReader({
            reader: readers[0],
            locationId: activeLocationId,
            autoReconnectOnUnexpectedDisconnect: true,
          });
        };

        try {
          await connectOnce(locationId);
        } catch (connectError) {
          const message = formatTerminalError(connectError, "");
          if (/no such location|resource_missing|invalid location/i.test(message)) {
            locationId = await ensureTerminalLocation({ forceRecreate: true });
            await connectOnce(locationId);
          } else {
            throw connectError;
          }
        }
        connectedReader = mapReader(readers[0]);
        return connectedReader;
      } catch (error) {
        throw new Error(formatTerminalError(error, "Reader connection failed"));
      }
    },

    async disconnect() {
      await StripeTerminal.disconnectReader();
      connectedReader = null;
    },

    async collectAndProcess(clientSecret: string) {
      await ensureNativeTerminalInitialized(() => {
        connectedReader = null;
        options.onUnexpectedDisconnect?.();
      });
      try {
        const connected = await StripeTerminal.getConnectedReader();
        if (!connected.reader) {
          await this.discoverAndConnect();
        }

        await StripeTerminal.collectPaymentMethod({ paymentIntent: clientSecret });
        await StripeTerminal.confirmPaymentIntent();

        const after = await StripeTerminal.getConnectedReader();
        connectedReader = after.reader ? mapReader(after.reader) : connectedReader;

        const paymentIntentId = extractPaymentIntentId(clientSecret);
        return {
          paymentIntentId,
          readerId: connectedReader?.id || null,
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

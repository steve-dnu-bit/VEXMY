/** How the native app discovers a Stripe Terminal reader. */
export type TerminalReaderMode = "bluetooth" | "tap_to_pay";

export type TerminalReaderInfo = {
  id: string;
  label?: string;
  device_type?: string;
  status?: string;
};

export type TerminalProviderStatus =
  | "idle"
  | "initializing"
  | "discovering"
  | "connecting"
  | "connected"
  | "processing"
  | "error";

export type TerminalCollectResult = {
  paymentIntentId: string;
  readerId: string | null;
};

/** Options for native Tap to Pay connect (Apple TTPOI 3.5 Terms on connectReader). */
export type DiscoverAndConnectOptions = {
  /** Disconnect first so connectReader can present Apple Terms when SDK still reports connected. */
  forceReconnect?: boolean;
};

export interface TerminalProvider {
  discoverAndConnect(options?: DiscoverAndConnectOptions): Promise<TerminalReaderInfo>;
  disconnect(): Promise<void>;
  collectAndProcess(clientSecret: string): Promise<TerminalCollectResult>;
  /** Cancel an in-flight collectPaymentMethod (Tap to Pay / WisePad). */
  cancelCollectPayment?(): Promise<void>;
  getConnectedReader(): TerminalReaderInfo | null;
  updateReaderDisplay?(cart: import("@/lib/terminal/readerDisplay").ReaderDisplayCart): Promise<void>;
}

export type TerminalProviderOptions = {
  simulated: boolean;
  readerMode: TerminalReaderMode;
  locationId?: string | null;
  onUnexpectedDisconnect?: () => void;
  onConnectionTokenError?: (message: string) => void;
  onReaderStatus?: (message: string) => void;
  onFirmwareUpdateChange?: (state: { active: boolean; progress: number; completed?: boolean }) => void;
};

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
  /**
   * Tap to Pay only. Present How to Tap here. Called when Apple's Terms are
   * accepted (the native presenter waits until that sheet is gone) and again
   * after connectReader returns if education has not started. Must not collect
   * a payment or open the payment overlay.
   */
  onTapToPayReadyForEducation?: () => Promise<void>;
};

/** Tap to Pay reader software install inside connectReader (not WisePad firmware). */
export type TapToPayInstallState = {
  active: boolean;
  /** 0–100 mapped from the SDK fraction. Null until the first progress callback. */
  progress: number | null;
  /** How to Tap is being presented. The install popup must stay hidden. */
  educationInFlight: boolean;
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
  onTapToPayInstallChange?: (state: TapToPayInstallState) => void;
};

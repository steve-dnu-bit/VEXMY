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

export interface TerminalProvider {
  discoverAndConnect(): Promise<TerminalReaderInfo>;
  disconnect(): Promise<void>;
  collectAndProcess(clientSecret: string): Promise<TerminalCollectResult>;
  getConnectedReader(): TerminalReaderInfo | null;
}

export type TerminalProviderOptions = {
  simulated: boolean;
  locationId?: string | null;
  onUnexpectedDisconnect?: () => void;
};

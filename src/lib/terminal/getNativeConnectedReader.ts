import { isNativeApp } from "@/lib/platform";
import { isNativeTerminalInitialized } from "@/lib/terminal/nativeTerminalState";
import type { TerminalReaderInfo } from "@/lib/terminal/types";

export async function getNativeConnectedReader(): Promise<TerminalReaderInfo | null> {
  if (!isNativeApp()) return null;
  // Calling getConnectedReader before initialize hard-crashes Android (native FATAL).
  if (!isNativeTerminalInitialized()) return null;

  try {
    const { StripeTerminal } = await import("@capacitor-community/stripe-terminal");
    const { reader } = await StripeTerminal.getConnectedReader();
    if (!reader) return null;

    return {
      id: reader.serialNumber || reader.label || "reader",
      label: reader.label,
      device_type: reader.deviceType,
      status: reader.status,
    };
  } catch {
    return null;
  }
}

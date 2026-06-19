import { isNativeApp } from "@/lib/platform";
import type { TerminalProvider, TerminalProviderOptions } from "@/lib/terminal/types";

/** Lazy-loads the native in-person payment plugin when a reader action runs. */
export async function createTerminalProvider(options: TerminalProviderOptions): Promise<TerminalProvider> {
  if (isNativeApp()) {
    const { createNativeTerminalProvider } = await import("@/lib/terminal/nativeTerminalProvider");
    return createNativeTerminalProvider(options);
  }
  const { createWebTerminalProvider } = await import("@/lib/terminal/webTerminalProvider");
  return createWebTerminalProvider(options);
}

export type { TerminalProvider, TerminalProviderOptions, TerminalReaderInfo, TerminalReaderMode, TerminalProviderStatus } from "@/lib/terminal/types";

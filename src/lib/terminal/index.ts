import { isNativeApp } from "@/lib/platform";
import { createNativeTerminalProvider } from "@/lib/terminal/nativeTerminalProvider";
import { createWebTerminalProvider } from "@/lib/terminal/webTerminalProvider";
import type { TerminalProvider, TerminalProviderOptions } from "@/lib/terminal/types";

export function createTerminalProvider(options: TerminalProviderOptions): TerminalProvider {
  if (isNativeApp()) {
    return createNativeTerminalProvider(options);
  }
  return createWebTerminalProvider(options);
}

export type { TerminalProvider, TerminalProviderOptions, TerminalReaderInfo, TerminalProviderStatus } from "@/lib/terminal/types";

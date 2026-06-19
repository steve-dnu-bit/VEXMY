import { Capacitor } from "@capacitor/core";

/** Register Stripe Terminal token listener before any POS screen loads. */
export async function bootstrapNativeTerminalListener(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { ensureNativeTerminalTokenListener } = await import("@/lib/terminal/nativeTerminalProvider");
  await ensureNativeTerminalTokenListener();
}

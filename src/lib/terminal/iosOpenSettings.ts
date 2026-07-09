import { Capacitor } from "@capacitor/core";
import { TerminalPermissions } from "@/lib/terminal/terminalNativePermissions";
import { velbokDebugLog } from "@/lib/terminal/iosTerminalDebug";

export async function openIosAppSettings(): Promise<void> {
  if (!Capacitor.isPluginAvailable("TerminalPermissions")) return;
  const plugin = TerminalPermissions as unknown as { openAppSettings?: () => Promise<void> };
  if (typeof plugin.openAppSettings !== "function") return;
  // #region agent log
  velbokDebugLog("iosOpenSettings.ts", "openAppSettings", {}, "FIX");
  // #endregion
  await plugin.openAppSettings();
}

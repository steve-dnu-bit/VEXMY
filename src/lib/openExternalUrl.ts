import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

/** Open http(s), mailto, sms, and wa.me links — Custom Tabs on native, new tab on web. */
export async function openExternalUrl(url: string): Promise<void> {
  const target = url?.trim();
  if (!target) return;
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url: target });
    return;
  }
  window.open(target, "_blank", "noopener,noreferrer");
}

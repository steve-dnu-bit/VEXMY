import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Open external links from the app.
 * - http(s): Capacitor Browser (Custom Tabs / SFSafariViewController)
 * - mailto / sms / tel / etc.: system intent via location — Browser cannot open these
 *   schemes on Android and throws (which surfaced as a toast next to WhatsApp).
 */
export async function openExternalUrl(url: string): Promise<void> {
  const target = url?.trim();
  if (!target) return;

  if (Capacitor.isNativePlatform()) {
    if (isHttpUrl(target)) {
      await Browser.open({ url: target });
      return;
    }
    // Intentionally not Browser.open — mailto/sms/tel crash or error in Custom Tabs.
    window.location.assign(target);
    return;
  }

  if (isHttpUrl(target)) {
    window.open(target, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(target);
}

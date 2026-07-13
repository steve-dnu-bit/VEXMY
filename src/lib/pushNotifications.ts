import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { nativePlatform } from "@/lib/platform";

export type PushNavigationPayload = {
  path?: string;
  type?: string;
  booking_id?: string;
  ticket_id?: string;
};

export function parsePushData(data: Record<string, unknown> | undefined): PushNavigationPayload {
  if (!data) return {};
  return {
    path: typeof data.path === "string" ? data.path : undefined,
    type: typeof data.type === "string" ? data.type : undefined,
    booking_id: typeof data.booking_id === "string" ? data.booking_id : undefined,
    ticket_id: typeof data.ticket_id === "string" ? data.ticket_id : undefined,
  };
}

export async function registerNativePushToken(userId: string, token: string): Promise<void> {
  if (!userId || !token) return;
  const platform = nativePlatform();
  if (platform === "web") return;

  await invokeEdgeFunctionJson("register-push-token", {
    token,
    platform,
    device_label: Capacitor.getPlatform(),
  });
}

export async function ensurePushNotificationChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== "android") return;
  await PushNotifications.createChannel({
    id: "velbok_default",
    name: "Velbok",
    description: "Appointments, messages, and reminders",
    importance: 5,
    sound: "default",
    vibration: true,
  });
}

export async function requestNativePushPermission(): Promise<"granted" | "denied" | "unsupported"> {
  if (!Capacitor.isNativePlatform()) return "unsupported";

  await ensurePushNotificationChannel();

  const current = await PushNotifications.checkPermissions();
  if (current.receive === "granted") return "granted";

  const requested = await PushNotifications.requestPermissions();
  if (requested.receive === "granted") return "granted";

  return "denied";
}

/** Call only after the registration listener is attached. */
export async function registerForPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await PushNotifications.register();
}

/** Clear notification center entries (iOS badge is cleared in AppDelegate on become-active). */
export async function clearDeliveredPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch {
    // Older plugin builds may not expose this — native AppDelegate still clears the badge.
  }
}

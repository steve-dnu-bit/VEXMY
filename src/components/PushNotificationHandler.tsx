import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PushNotifications } from "@capacitor/push-notifications";
import type { PluginListenerHandle } from "@capacitor/core";
import { useAuth } from "@/hooks/useAuth";
import { isNativeApp } from "@/lib/platform";
import {
  parsePushData,
  registerForPushNotifications,
  registerNativePushToken,
  requestNativePushPermission,
} from "@/lib/pushNotifications";

/** Registers FCM tokens and routes notification taps on native Android/iOS. */
const PushNotificationHandler = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeApp() || !user?.id) return;

    userIdRef.current = user.id;
    let cancelled = false;
    const handles: PluginListenerHandle[] = [];

    const bind = async () => {
      const registrationHandle = await PushNotifications.addListener("registration", (event) => {
        const activeUserId = userIdRef.current;
        if (activeUserId) void registerNativePushToken(activeUserId, event.value);
      });
      handles.push(registrationHandle);

      const registrationErrorHandle = await PushNotifications.addListener("registrationError", (error) => {
        console.warn("Push registration failed", error);
      });
      handles.push(registrationErrorHandle);

      const actionHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
        const payload = parsePushData(event.notification.data as Record<string, unknown> | undefined);
        if (payload.path) navigate(payload.path);
      });
      handles.push(actionHandle);

      const permission = await requestNativePushPermission();
      if (cancelled || permission !== "granted") return;

      await registerForPushNotifications();
    };

    void bind();

    return () => {
      cancelled = true;
      userIdRef.current = null;
      void Promise.all(handles.map((h) => h.remove()));
    };
  }, [user?.id, navigate]);

  return null;
};

export default PushNotificationHandler;

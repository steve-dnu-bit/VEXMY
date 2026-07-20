import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { useAuth } from "@/hooks/useAuth";

/** Hide native splash only after auth restore settles (avoids black flash while Loading…). */
export function NativeSplashHider() {
  const { loading } = useAuth();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (loading) return;
    void SplashScreen.hide().catch(() => undefined);
  }, [loading]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    // Failsafe: never leave splash up if auth hangs past the restore window.
    const timer = window.setTimeout(() => {
      void SplashScreen.hide().catch(() => undefined);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}

export default NativeSplashHider;

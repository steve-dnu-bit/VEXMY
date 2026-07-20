import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { isIpadDevice, isNativeApp, nativePlatform } from "@/lib/platform";
import {
  hasSeenTapToPayAwareness,
  hasSentTapToPayAwarenessPush,
  markTapToPayAwarenessPushSent,
  markTapToPayAwarenessSeen,
} from "@/lib/terminal/tapToPayAwareness";
import { TapToPayAwarenessSplash } from "@/components/pos/TapToPayAwarenessSplash";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { isBiometricSessionUnlocked, isBiometricUnlockEnabled } from "@/lib/biometricUnlock";

/**
 * Staff iOS: one-time Tap to Pay awareness splash + optional Value Proposition push (3.1–3.3 / 6.3).
 * Never mounts over a locked biometric gate (dark overlay on dark = looks like a dead black screen).
 */
export function TapToPayAwarenessHost() {
  const { user } = useAuth();
  const { data: orgSub, canManageBilling, isActive } = useSubscription();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const organizationId = orgSub?.organizationId ?? null;
  const userId = user?.id ?? null;

  const dismiss = () => {
    if (organizationId && userId) markTapToPayAwarenessSeen(organizationId, userId);
    setOpen(false);
  };

  useEffect(() => {
    if (!isNativeApp() || nativePlatform() !== "ios" || isIpadDevice()) return;
    if (!userId || !organizationId || !canManageBilling || !isActive) return;
    if (hasSeenTapToPayAwareness(organizationId, userId)) return;
    if (isBiometricUnlockEnabled() && !isBiometricSessionUnlocked()) return;

    const path = location.pathname;
    if (
      path.startsWith("/auth") ||
      path.startsWith("/shop-setup") ||
      path.startsWith("/checkout") ||
      path.startsWith("/subscribe")
    ) {
      return;
    }

    const timer = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(timer);
  }, [userId, organizationId, canManageBilling, isActive, location.pathname]);

  useEffect(() => {
    if (!userId || !organizationId || !canManageBilling || !isActive) return;
    if (!isNativeApp() || nativePlatform() !== "ios" || isIpadDevice()) return;
    if (hasSentTapToPayAwarenessPush(organizationId, userId)) return;

    void (async () => {
      const { data, error } = await invokeEdgeFunctionJson<{ ok?: boolean }>("ttpoi-awareness-notify", {
        action: "push",
      });
      if (!error && data?.ok) {
        markTapToPayAwarenessPushSent(organizationId, userId);
      }
    })();
  }, [userId, organizationId, canManageBilling, isActive]);

  if (!userId || !organizationId) return null;

  return (
    <TapToPayAwarenessSplash
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
        else setOpen(true);
      }}
      onDismiss={dismiss}
    />
  );
}

export default TapToPayAwarenessHost;

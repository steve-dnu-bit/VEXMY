import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { isNativeApp } from "@/lib/platform";
import {
  authenticateWithBiometrics,
  checkBiometricAvailability,
  isBiometricSessionUnlocked,
  isBiometricUnlockEnabled,
  markBiometricSessionUnlocked,
} from "@/lib/biometricUnlock";
import { App } from "@capacitor/app";
import { BiometricUnlockPrompt } from "@/components/settings/BiometricUnlockSettingsCard";

/**
 * When biometric unlock is enabled, require Face ID / Touch ID once per cold session.
 */
export function BiometricUnlockGate() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!isNativeApp() || !user) return;

    const evaluate = async () => {
      if (!isBiometricUnlockEnabled()) {
        setLocked(false);
        // Offer one-time enable prompt for staff with biometrics available
        const avail = await checkBiometricAvailability();
        if (avail.available) setShowPrompt(true);
        return;
      }
      if (isBiometricSessionUnlocked()) {
        setLocked(false);
        return;
      }
      setLocked(true);
    };

    void evaluate();

    const handle = App.addListener("appStateChange", ({ isActive }) => {
      // Re-lock after backgrounding for a while is optional; clear only on explicit disable.
      if (isActive && isBiometricUnlockEnabled() && !isBiometricSessionUnlocked()) {
        setLocked(true);
      }
    });

    return () => {
      void handle.then((h) => h.remove());
    };
  }, [user?.id]);

  const unlock = async () => {
    setBusy(true);
    try {
      const ok = await authenticateWithBiometrics(t("settings.biometricUnlockReason"));
      if (ok) {
        markBiometricSessionUnlocked();
        setLocked(false);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!user || !isNativeApp()) return null;

  return (
    <>
      <BiometricUnlockPrompt open={showPrompt} onDone={() => setShowPrompt(false)} />
      {locked ? (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-background px-6">
          <Fingerprint className="h-12 w-12 text-primary" />
          <p className="text-center text-sm text-muted-foreground max-w-xs">{t("settings.biometricGateHint")}</p>
          <Button type="button" variant="gold" disabled={busy} onClick={() => void unlock()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Fingerprint className="h-4 w-4 mr-2" />}
            {t("settings.biometricUnlockCta")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              markBiometricSessionUnlocked();
              setLocked(false);
            }}
          >
            {t("settings.biometricSkipOnce")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

export default BiometricUnlockGate;

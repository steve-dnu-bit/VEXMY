import { useEffect, useRef, useState } from "react";
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
 * Force-kill clears sessionStorage, so this gate returns after relaunch — auto-prompt Face ID
 * and always offer Skip so the app never sticks on a blank dark screen.
 */
export function BiometricUnlockGate() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const autoPromptedRef = useRef(false);

  useEffect(() => {
    if (!isNativeApp() || loading || !user) {
      setLocked(false);
      return;
    }

    const evaluate = async () => {
      if (!isBiometricUnlockEnabled()) {
        setLocked(false);
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
      if (!isActive) return;
      if (!isBiometricUnlockEnabled()) return;
      if (isBiometricSessionUnlocked()) return;
      setLocked(true);
      autoPromptedRef.current = false;
    });

    return () => {
      void handle.then((h) => h.remove());
    };
  }, [user?.id, loading]);

  useEffect(() => {
    if (!locked || autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
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
      })();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [locked, t]);

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

  const skipOnce = () => {
    markBiometricSessionUnlocked();
    setLocked(false);
  };

  if (!user || !isNativeApp()) return null;

  return (
    <>
      <BiometricUnlockPrompt open={showPrompt} onDone={() => setShowPrompt(false)} />
      {locked ? (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-zinc-50">
          <Fingerprint className="h-12 w-12 text-amber-400" />
          <p className="text-center text-sm text-zinc-300 max-w-xs">{t("settings.biometricGateHint")}</p>
          <Button type="button" variant="gold" disabled={busy} onClick={() => void unlock()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Fingerprint className="h-4 w-4 mr-2" />}
            {t("settings.biometricUnlockCta")}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="text-zinc-200" onClick={skipOnce}>
            {t("settings.biometricSkipOnce")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

export default BiometricUnlockGate;

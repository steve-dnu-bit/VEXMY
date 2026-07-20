import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Fingerprint, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { isNativeApp } from "@/lib/platform";
import {
  checkBiometricAvailability,
  hasPromptedBiometricUnlock,
  isBiometricUnlockEnabled,
  markBiometricUnlockPrompted,
  setBiometricUnlockEnabled,
  type BiometricAvailability,
} from "@/lib/biometricUnlock";
import { toast } from "sonner";

/** Apple TTPOI 1.7 — optional Face ID / Touch ID unlock for returning sessions. */
export function BiometricUnlockSettingsCard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<BiometricAvailability>({
    available: false,
    biometryType: "none",
  });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) {
      setLoading(false);
      return;
    }
    void (async () => {
      const avail = await checkBiometricAvailability();
      setAvailability(avail);
      setEnabled(isBiometricUnlockEnabled());
      setLoading(false);
    })();
  }, []);

  if (!isNativeApp() || loading) {
    if (!isNativeApp()) return null;
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!availability.available) return null;

  const biometryLabel =
    availability.biometryType === "faceId"
      ? t("settings.biometricFaceId")
      : availability.biometryType === "touchId"
        ? t("settings.biometricTouchId")
        : t("settings.biometricGeneric");

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">{t("settings.biometricTitle")}</CardTitle>
        </div>
        <CardDescription>{t("settings.biometricDesc", { method: biometryLabel })}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <Label htmlFor="biometric-unlock" className="text-sm">
          {t("settings.biometricToggle", { method: biometryLabel })}
        </Label>
        <Switch
          id="biometric-unlock"
          checked={enabled}
          onCheckedChange={(checked) => {
            setBiometricUnlockEnabled(checked);
            markBiometricUnlockPrompted();
            setEnabled(checked);
            toast.success(checked ? t("settings.biometricEnabled") : t("settings.biometricDisabled"));
          }}
        />
      </CardContent>
    </Card>
  );
}

/** One-time opt-in prompt after successful login when biometrics are available. */
export function BiometricUnlockPrompt({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);

  useEffect(() => {
    if (!open) return;
    void checkBiometricAvailability().then(setAvailability);
  }, [open]);

  if (!open || !availability?.available || hasPromptedBiometricUnlock()) return null;

  const biometryLabel =
    availability.biometryType === "faceId"
      ? t("settings.biometricFaceId")
      : availability.biometryType === "touchId"
        ? t("settings.biometricTouchId")
        : t("settings.biometricGeneric");

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-sm bg-card border-border shadow-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Fingerprint className="h-5 w-5" />
            {t("settings.biometricPromptTitle", { method: biometryLabel })}
          </CardTitle>
          <CardDescription>{t("settings.biometricPromptDesc", { method: biometryLabel })}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button
            type="button"
            variant="gold"
            onClick={() => {
              setBiometricUnlockEnabled(true);
              markBiometricUnlockPrompted();
              onDone();
            }}
          >
            {t("settings.biometricEnableCta", { method: biometryLabel })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              markBiometricUnlockPrompted();
              onDone();
            }}
          >
            {t("settings.biometricSkip")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default BiometricUnlockSettingsCard;

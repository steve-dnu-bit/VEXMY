import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Smartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TapToPayWaveIcon } from "@/components/pos/TapToPayWaveIcon";
import { TapToPayReadinessAlert } from "@/components/pos/TapToPayReadinessAlert";
import { TapToPayTryItDialog } from "@/components/pos/TapToPayTryItDialog";
import { useSubscription } from "@/hooks/useSubscription";
import { isIpadDevice, isNativeApp, nativePlatform } from "@/lib/platform";
import { showTapToPayEducationIfAvailable } from "@/lib/terminal/tapToPayEducation";
import { tapToPayOnIphoneLabel } from "@/lib/terminal/tapToPayLabels";
import { clearTapToPayEducationShown } from "@/lib/terminal/tapToPaySetupStorage";
import { saveTerminalReaderMode } from "@/lib/terminal/terminalReaderModeStorage";
import { formatTapToPayDiagnostics, ttpLog, ttpLogError } from "@/lib/terminal/tapToPayDiagnostics";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { toast } from "sonner";
import i18n from "@/i18n";

/**
 * Apple TTPOI 3.6 / 4.3 — enable Tap to Pay and re-open How to Tap from Settings (outside checkout).
 */
export function TapToPaySettingsCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canManageBilling } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [showTryIt, setShowTryIt] = useState(false);
  const [iosOnly, setIosOnly] = useState(false);

  useEffect(() => {
    setIosOnly(isNativeApp() && nativePlatform() === "ios" && !isIpadDevice());
  }, []);

  if (!iosOnly) return null;

  const label = tapToPayOnIphoneLabel(i18n.language);

  const enable = () => {
    ttpLog("settings.enable.tapped", { canManageBilling });
    if (!canManageBilling) {
      toast.error(t("pos.tapToPayContactAdmin"));
      return;
    }
    // Checkout only runs the enable path in Tap to Pay reader mode, so a phone last used
    // with a WisePad would otherwise land on a dead button.
    saveTerminalReaderMode("tap_to_pay");
    // Replay Apple's How to Tap after this run. Apple's Terms sheet itself only
    // reappears once the merchant ID is removed in Apple Business Register.
    clearTapToPayEducationShown();
    navigate("/checkout?enableTapToPay=1");
  };

  const showEducation = async () => {
    setBusy(true);
    ttpLog("settings.education.tapped");
    try {
      const shown = await showTapToPayEducationIfAvailable();
      ttpLog("settings.education.result", { shown });
      if (!shown) {
        toast.message(t("pos.tapToPayHowToUnavailable"));
        return;
      }
      setShowTryIt(true);
    } catch (e) {
      ttpLogError("settings.education.failed", e);
      toast.error(e instanceof Error ? e.message : t("pos.tapToPayEducationFailed"));
    } finally {
      setBusy(false);
    }
  };

  const copyDiagnostics = async () => {
    const report = formatTapToPayDiagnostics();
    try {
      await navigator.clipboard.writeText(report);
      toast.success(t("pos.tapToPayDiagnosticsCopied"));
    } catch {
      // Clipboard is unavailable in some WebView contexts — the console copy still helps.
      console.info(report);
      toast.message(t("pos.tapToPayDiagnosticsCopyFailed"));
    }
  };

  const sendLaunchEmail = async () => {
    setBusy(true);
    try {
      const { data, error } = await invokeEdgeFunctionJson<{ ok?: boolean; emailsSent?: number }>(
        "ttpoi-awareness-notify",
        { action: "launch_email" },
      );
      if (error || !data?.ok) {
        toast.error(error?.message || t("pos.launchEmailFailed"));
        return;
      }
      toast.success(t("pos.launchEmailSent", { count: data.emailsSent ?? 0 }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TapToPayWaveIcon className="h-5 w-5 text-primary" filled />
            <CardTitle className="text-base">{label}</CardTitle>
          </div>
          <CardDescription>{t("pos.settingsTapToPayDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground flex items-start gap-2">
            <Smartphone className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {t("pos.awarenessDeviceHint")}
          </p>

          <TapToPayReadinessAlert readerMode="tap_to_pay" />

          {!canManageBilling ? (
            <Alert>
              <AlertTitle className="text-sm">{t("pos.tapToPayContactAdmin")}</AlertTitle>
              <AlertDescription className="text-xs">{t("pos.settingsTapToPayNonAdminHint")}</AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="button" variant="gold" onClick={enable} disabled={busy}>
                  <TapToPayWaveIcon className="h-4 w-4 mr-2" filled />
                  {t("pos.connectTapToPay")}
                </Button>
                <Button type="button" variant="outline" onClick={() => void showEducation()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {t("pos.tapToPayHowToTap")}
                </Button>
              </div>
              <Button type="button" variant="ghost" size="sm" className="self-start" disabled={busy} onClick={() => void sendLaunchEmail()}>
                {t("pos.launchEmailCta")}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => void copyDiagnostics()}>
                {t("pos.tapToPayCopyDiagnostics")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <TapToPayTryItDialog open={showTryIt} onOpenChange={setShowTryIt} />
    </>
  );
}

export default TapToPaySettingsCard;

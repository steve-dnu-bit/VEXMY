import { useTranslation } from "react-i18next";
import { Loader2, Settings2, Smartphone, Wifi } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import OrgPosSetupChecklist from "@/components/pos/OrgPosSetupChecklist";
import { WisePadSetupPanels } from "@/components/pos/WisePadSetupPanels";
import { TapToPayReadinessAlert } from "@/components/pos/TapToPayReadinessAlert";
import StripeConnectCard from "@/components/subscription/StripeConnectCard";
import type { TerminalReaderMode } from "@/lib/terminal/types";
import type { useStripeTerminal } from "@/hooks/useStripeTerminal";
import { isNativeApp, nativePlatform, isIpadDevice } from "@/lib/platform";

type PosSetupGuideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectReady: boolean;
  locationId: string | null;
  simulatedReader: boolean;
  readerMode: TerminalReaderMode;
  onReaderModeChange: (mode: TerminalReaderMode) => void;
  terminal: ReturnType<typeof useStripeTerminal>;
  showWisePadGuide: boolean;
  onDismissWisePadGuide: () => void;
  testingStripeLink: boolean;
  onTestStripeLink: () => void;
  onShowTapToPayEducation?: () => void;
};

const PosSetupGuideDialog = ({
  open,
  onOpenChange,
  connectReady,
  locationId,
  simulatedReader,
  readerMode,
  onReaderModeChange,
  terminal,
  showWisePadGuide,
  onDismissWisePadGuide,
  testingStripeLink,
  onTestStripeLink,
  onShowTapToPayEducation,
}: PosSetupGuideDialogProps) => {
  const { t } = useTranslation();
  const usingTapToPay = isNativeApp() && !simulatedReader && readerMode === "tap_to_pay";
  const usingWisePad = isNativeApp() && !simulatedReader && readerMode === "bluetooth";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            {t("pos.setupGuideTitle")}
          </DialogTitle>
          <DialogDescription>{t("pos.setupGuideDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!connectReady ? (
            <StripeConnectCard compact returnPath="/checkout" refreshPath="/checkout" />
          ) : null}

          <OrgPosSetupChecklist hideAdminLink />

          {isNativeApp() && !simulatedReader ? (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-sm font-medium">{t("pos.readerModeTitle")}</p>
              <RadioGroup
                value={readerMode}
                onValueChange={(value) => onReaderModeChange(value as TerminalReaderMode)}
                className="grid gap-2"
              >
                <label
                  htmlFor="setup-reader-bluetooth"
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${readerMode === "bluetooth" ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <RadioGroupItem id="setup-reader-bluetooth" value="bluetooth" className="mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Wifi className="h-4 w-4" />
                      {t("pos.readerModeBluetooth")}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{t("pos.readerModeBluetoothHint")}</p>
                  </div>
                </label>
                <label
                  htmlFor="setup-reader-tap"
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${readerMode === "tap_to_pay" ? "border-primary bg-primary/5" : "border-border"} ${isIpadDevice() ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <RadioGroupItem id="setup-reader-tap" value="tap_to_pay" className="mt-0.5" disabled={isIpadDevice()} />
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Smartphone className="h-4 w-4" />
                      {t("pos.readerModeTapToPay")}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isIpadDevice()
                        ? "Not available on iPad — use WisePad (Bluetooth reader)."
                        : t("pos.readerModeTapToPayHint")}
                    </p>
                  </div>
                </label>
              </RadioGroup>

              {usingTapToPay ? (
                <div className="space-y-3">
                  <TapToPayReadinessAlert readerMode={readerMode} />
                  {locationId ? (
                    <Button type="button" variant="outline" size="sm" disabled={testingStripeLink} onClick={onTestStripeLink}>
                      {testingStripeLink ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                      {t("pos.tapToPayTestStripeLink")}
                    </Button>
                  ) : null}
                  <Alert>
                    <AlertTitle className="text-sm">{t("pos.tapToPayInfoTitle")}</AlertTitle>
                    <AlertDescription className="text-xs space-y-2">
                      <p>{t("pos.tapToPayInfoBody")}</p>
                      {nativePlatform() === "ios" && onShowTapToPayEducation ? (
                        <Button type="button" size="sm" variant="outline" onClick={onShowTapToPayEducation}>
                          {t("pos.tapToPayHowToTap")}
                        </Button>
                      ) : null}
                    </AlertDescription>
                  </Alert>
                </div>
              ) : null}

              {usingWisePad && connectReady && locationId ? (
                <WisePadSetupPanels
                  terminal={terminal}
                  showFirstTimeGuide={showWisePadGuide}
                  onDismissGuide={onDismissWisePadGuide}
                />
              ) : null}
            </div>
          ) : !simulatedReader ? (
            <p className="text-xs text-muted-foreground">{t("pos.mobileAppRequired")}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PosSetupGuideDialog;

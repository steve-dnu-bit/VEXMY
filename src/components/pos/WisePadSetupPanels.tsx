import { useTranslation } from "react-i18next";
import { Download, Info, Smartphone, Wifi } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { StripeTerminalHook } from "@/lib/terminal/wisePadSetupStorage";

type WisePadSetupPanelsProps = {
  terminal: StripeTerminalHook;
  showFirstTimeGuide: boolean;
  onDismissGuide: () => void;
};

export function WisePadSetupPanels({ terminal, showFirstTimeGuide, onDismissGuide }: WisePadSetupPanelsProps) {
  const { t } = useTranslation();
  const { firmwareUpdate } = terminal;

  return (
    <div className="space-y-3">
      {showFirstTimeGuide && !firmwareUpdate.active ? (
        <Alert className="border-amber-500/40 bg-card shadow-sm">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-foreground">{t("pos.wisePadFirstTimeTitle")}</AlertTitle>
          <AlertDescription className="text-foreground space-y-3">
            <p className="text-muted-foreground">{t("pos.wisePadFirstTimeIntro")}</p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-foreground">
              <li>{t("pos.wisePadFirstTimeTipMobileData")}</li>
              <li>{t("pos.wisePadFirstTimeTipStayOpen")}</li>
              <li>{t("pos.wisePadFirstTimeTipProximity")}</li>
              <li>{t("pos.wisePadFirstTimeTipBluetooth")}</li>
              <li>{t("pos.wisePadFirstTimeTipDuration")}</li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" onClick={onDismissGuide}>
                {t("pos.wisePadFirstTimeGotIt")}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {firmwareUpdate.active ? (
        <Alert className="border-amber-500/50 bg-card shadow-sm">
          <Download className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-pulse" />
          <AlertTitle className="text-foreground">
            {t("pos.wisePadFirmwareTitle", { percent: firmwareUpdate.progress })}
          </AlertTitle>
          <AlertDescription className="space-y-3 text-foreground">
            <Progress value={firmwareUpdate.progress} className="h-2" />
            <p>{t("pos.wisePadFirmwareBody")}</p>
            {firmwareUpdate.progress <= 0 ? (
              <p className="text-sm text-amber-800 dark:text-amber-300">{t("pos.wisePadFirmwareStuckHint")}</p>
            ) : null}
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li className="flex gap-2">
                <Smartphone className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{t("pos.wisePadFirmwareTipPhone")}</span>
              </li>
              <li className="flex gap-2">
                <Wifi className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{t("pos.wisePadFirmwareTipNetwork")}</span>
              </li>
            </ul>
            <p className="text-xs">{t("pos.wisePadFirmwareTokenNote")}</p>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TapToPayWaveIcon } from "@/components/pos/TapToPayWaveIcon";
import { tapToPayOnIphoneLabel } from "@/lib/terminal/tapToPayLabels";
import i18n from "@/i18n";

type TapToPayEnableDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  onAcceptTermsAndEnable: () => void;
};

/**
 * Apple TTPOI 3.5 — clear action that triggers acceptance of Apple’s Tap to Pay
 * Terms and Conditions before any payment attempt.
 */
export function TapToPayEnableDialog({
  open,
  onOpenChange,
  busy = false,
  onAcceptTermsAndEnable,
}: TapToPayEnableDialogProps) {
  const { t } = useTranslation();
  const label = tapToPayOnIphoneLabel(i18n.language);

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <TapToPayWaveIcon className="h-5 w-5 text-primary" filled />
            {t("pos.enableTermsTitle")}
          </DialogTitle>
          <DialogDescription className="text-left space-y-2">
            <span className="block">{t("pos.enableTermsBody")}</span>
            <span className="block text-foreground/90">{t("pos.enableTermsAppleSheet")}</span>
            <span className="block">{t("pos.enableTermsEducationNext")}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            type="button"
            variant="gold"
            className="w-full h-14 text-base font-semibold"
            disabled={busy}
            onClick={onAcceptTermsAndEnable}
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <TapToPayWaveIcon className="h-5 w-5 mr-2" filled />
            )}
            {busy ? t("pos.connectTapToPayProgress") : t("pos.enableTermsCta", { label })}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default TapToPayEnableDialog;

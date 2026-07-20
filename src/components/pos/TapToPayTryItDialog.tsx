import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TapToPayWaveIcon } from "@/components/pos/TapToPayWaveIcon";

type TapToPayTryItDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Apple TTPOI 3.9 — invite merchant to try Tap to Pay after education. */
export function TapToPayTryItDialog({ open, onOpenChange }: TapToPayTryItDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TapToPayWaveIcon className="h-5 w-5 text-primary" />
            {t("pos.tryItTitle")}
          </DialogTitle>
          <DialogDescription>{t("pos.tryItDesc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            type="button"
            variant="gold"
            onClick={() => {
              onOpenChange(false);
              navigate("/checkout");
            }}
          >
            {t("pos.tryItGoCheckout")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("pos.tryItLater")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default TapToPayTryItDialog;

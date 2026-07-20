import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TapToPayWaveIcon } from "@/components/pos/TapToPayWaveIcon";
import { tapToPayOnIphoneLabel } from "@/lib/terminal/tapToPayLabels";
import i18n from "@/i18n";

type TapToPayAwarenessSplashProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnable?: () => void;
  onDismiss: () => void;
};

/**
 * Apple TTPOI 3.1–3.3 / 6.2 — one-time full-screen awareness for eligible merchants.
 * Drop Marketing Toolkit Hero art into /marketing/ttpoi/hero.jpg when available.
 */
export function TapToPayAwarenessSplash({
  open,
  onOpenChange,
  onEnable,
  onDismiss,
}: TapToPayAwarenessSplashProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const label = tapToPayOnIphoneLabel(i18n.language);

  const enable = () => {
    onDismiss();
    onOpenChange(false);
    if (onEnable) {
      onEnable();
      return;
    }
    navigate("/checkout?enableTapToPay=1");
  };

  const later = () => {
    onDismiss();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0 border-border sm:rounded-xl">
        <div className="relative min-h-[220px] bg-gradient-to-b from-zinc-900 to-zinc-950 text-white flex flex-col items-center justify-center px-6 py-10 text-center">
          <img
            src="/marketing/ttpoi/hero.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
              <TapToPayWaveIcon className="h-7 w-7 text-amber-300" />
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/70">{t("pos.awarenessEyebrow")}</p>
            <h2 className="font-display text-2xl font-semibold leading-tight">{label}</h2>
            <p className="text-sm text-white/85 max-w-sm">{t("pos.awarenessBody")}</p>
          </div>
        </div>
        <div className="space-y-3 p-5 bg-background">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base">{t("pos.awarenessTitle")}</DialogTitle>
            <DialogDescription>{t("pos.awarenessDesc")}</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground flex items-start gap-2">
            <Smartphone className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {t("pos.awarenessDeviceHint")}
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <Button type="button" variant="gold" className="w-full" onClick={enable}>
              <TapToPayWaveIcon className="h-4 w-4 mr-2" />
              {t("pos.awarenessEnableCta")}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={later}>
              {t("pos.awarenessLater")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default TapToPayAwarenessSplash;

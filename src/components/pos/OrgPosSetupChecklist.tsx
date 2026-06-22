import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { getUserOrganizationId } from "@/lib/shopSettings";
import {
  defaultShopPosSettings,
  loadShopPosSettings,
  saveShopPosSettings,
  type ShopPosSettings,
} from "@/lib/posCheckout";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";

export type OrgPosSetupSnapshot = {
  connectReady: boolean;
  posEnabled: boolean;
  hasTerminalLocation: boolean;
  simulatedReader: boolean;
  readyForCheckout: boolean;
};

type OrgPosSetupChecklistProps = {
  /** Show enable toggle, split %, and terminal setup (shop wizard). */
  interactive?: boolean;
  /** Hide the admin settings link (e.g. already on admin page). */
  hideAdminLink?: boolean;
  className?: string;
  onStatusChange?: (status: OrgPosSetupSnapshot) => void;
};

const OrgPosSetupChecklist = ({
  interactive = false,
  hideAdminLink = false,
  className = "",
  onStatusChange,
}: OrgPosSetupChecklistProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [connectReady, setConnectReady] = useState(false);
  const [settings, setSettings] = useState<Omit<ShopPosSettings, "organization_id">>(defaultShopPosSettings());
  const [settingUpTerminal, setSettingUpTerminal] = useState(false);

  const hasTerminalLocation = !!settings.stripe_terminal_location_id?.trim();
  const readyForCheckout = connectReady && settings.enabled && hasTerminalLocation;

  const emitStatus = useCallback(() => {
    onStatusChange?.({
      connectReady,
      posEnabled: settings.enabled,
      hasTerminalLocation,
      simulatedReader: settings.simulated_reader,
      readyForCheckout,
    });
  }, [connectReady, settings.enabled, settings.simulated_reader, hasTerminalLocation, readyForCheckout, onStatusChange]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const id = await getUserOrganizationId();
    setOrgId(id);
    const [posRow, connectRes] = await Promise.all([
      id ? loadShopPosSettings(id) : Promise.resolve(null),
      invokeEdgeFunctionJson<{ connect?: { ready?: boolean } }>("stripe-terminal-pos", { action: "connect_status" }),
    ]);
    setConnectReady(!!connectRes.data?.connect?.ready);
    if (posRow) {
      const { organization_id: _org, ...rest } = posRow;
      setSettings(rest);
    } else {
      setSettings(defaultShopPosSettings());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!loading) emitStatus();
  }, [loading, emitStatus]);

  const patchSettings = (partial: Partial<Omit<ShopPosSettings, "organization_id">>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      if (partial.shop_split_percent != null) {
        next.artist_split_percent = 100 - Number(partial.shop_split_percent);
      }
      return next;
    });
  };

  const persistSettings = async (patch: Partial<Omit<ShopPosSettings, "organization_id">>) => {
    if (!orgId) return;
    const next = { ...settings, ...patch };
    if (patch.shop_split_percent != null) {
      next.artist_split_percent = 100 - Number(patch.shop_split_percent);
    }
    const { error } = await saveShopPosSettings(orgId, next);
    if (error) {
      toast.error(error);
      return false;
    }
    setSettings(next);
    return true;
  };

  const setupTerminalLocation = async () => {
    setSettingUpTerminal(true);
    const { data, error } = await invokeEdgeFunctionJson<{ locationId?: string }>("stripe-terminal-pos", {
      action: "ensure_location",
    });
    setSettingUpTerminal(false);
    if (error || !data.locationId) {
      toast.error(error?.message || t("pos.terminalSetupFailed"));
      return;
    }
    patchSettings({ stripe_terminal_location_id: data.locationId });
    const ok = await persistSettings({ stripe_terminal_location_id: data.locationId });
    if (ok) toast.success(t("pos.terminalSetupDone"));
  };

  const steps = [
    {
      key: "connect",
      done: connectReady,
      label: t("pos.setupChecklist.connect"),
      hint: connectReady ? t("pos.setupChecklist.connectDone") : t("pos.setupChecklist.connectPending"),
    },
    {
      key: "terminal",
      done: hasTerminalLocation,
      label: t("pos.setupChecklist.terminal"),
      hint: hasTerminalLocation
        ? t("pos.setupChecklist.terminalDone")
        : t("pos.setupChecklist.terminalPending"),
    },
    {
      key: "enabled",
      done: settings.enabled,
      label: t("pos.setupChecklist.enabled"),
      hint: settings.enabled ? t("pos.setupChecklist.enabledDone") : t("pos.setupChecklist.enabledPending"),
    },
    {
      key: "reader",
      done: false,
      optional: true,
      label: t("pos.setupChecklist.reader"),
      hint: t("pos.setupChecklist.readerHint"),
    },
  ] as const;

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("pos.setupChecklist.loading")}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="rounded-lg border border-border divide-y divide-border">
        {steps.map((step) => (
          <div key={step.key} className="flex gap-3 p-3 text-sm">
            {step.done ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <Circle className={`h-5 w-5 shrink-0 ${"optional" in step && step.optional ? "text-muted-foreground/50" : "text-muted-foreground"}`} />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">{step.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{step.hint}</p>
            </div>
          </div>
        ))}
      </div>

      {readyForCheckout ? (
        <p className="text-xs text-emerald-600">{t("pos.setupChecklist.ready")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("pos.setupChecklist.notReady")}</p>
      )}

      {interactive ? (
        <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-sm">{t("pos.enableCheckout")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("setup.stepPosEnableHint")}</p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => {
                patchSettings({ enabled: v });
                void persistSettings({ enabled: v });
              }}
            />
          </div>

          {settings.enabled ? (
            <>
              <div>
                <Label htmlFor="wizard-pos-split">{t("pos.shopSplitPercent")}</Label>
                <Input
                  id="wizard-pos-split"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="mt-1 max-w-[8rem]"
                  value={settings.shop_split_percent}
                  onChange={(e) => patchSettings({ shop_split_percent: Number(e.target.value) })}
                  onBlur={() => void persistSettings({ shop_split_percent: settings.shop_split_percent })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.shop_split_percent >= 100
                    ? t("pos.shopOnlyDefaultSplit")
                    : t("pos.artistGets", { percent: settings.artist_split_percent })}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={settings.shop_split_percent >= 100 ? "default" : "outline"}
                    className="h-8"
                    onClick={() => {
                      patchSettings({ shop_split_percent: 100 });
                      void persistSettings({ shop_split_percent: 100 });
                    }}
                  >
                    {t("pos.shopOnlySplitPreset")}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!connectReady || settingUpTerminal || hasTerminalLocation}
                  onClick={() => void setupTerminalLocation()}
                >
                  {settingUpTerminal ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {hasTerminalLocation ? t("pos.setupChecklist.terminalDone") : t("pos.setupTerminal")}
                </Button>
                <div className="flex items-center gap-2">
                  <Switch
                    id="wizard-sim-reader"
                    checked={settings.simulated_reader}
                    onCheckedChange={(v) => {
                      patchSettings({ simulated_reader: v });
                      void persistSettings({ simulated_reader: v });
                    }}
                  />
                  <Label htmlFor="wizard-sim-reader" className="text-xs font-normal cursor-pointer">
                    {t("pos.simulatedReader")}
                  </Label>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {!hideAdminLink && !interactive ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin?tab=pos-checkout">{t("pos.openAdminSettings")}</Link>
          </Button>
          {!hasTerminalLocation && connectReady ? (
            <Button type="button" variant="outline" size="sm" disabled={settingUpTerminal} onClick={() => void setupTerminalLocation()}>
              {settingUpTerminal ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("pos.setupTerminal")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground flex items-start gap-1">
        <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
        {t("pos.setupChecklist.stripeDashboardHint")}
      </p>
    </div>
  );
};

export default OrgPosSetupChecklist;

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertCircle, CheckCircle2, ExternalLink, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchStripeConnectStatus,
  openStripeConnectDashboard,
  startStripeConnectOnboarding,
  type StripeConnectBusinessType,
  type StripeConnectStatus,
} from "@/lib/stripeConnect";

type StripeConnectCardProps = {
  compact?: boolean;
  returnPath?: string;
  refreshPath?: string;
  /** Pre-selected from shop setup; used when creating the Connect account. */
  businessType?: StripeConnectBusinessType | "" | null;
  onBusinessTypeChange?: (value: StripeConnectBusinessType) => void;
};

const StripeConnectCard = ({
  compact = false,
  returnPath,
  refreshPath,
  businessType,
  onBusinessTypeChange,
}: StripeConnectCardProps) => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [localBusinessType, setLocalBusinessType] = useState<StripeConnectBusinessType | "">("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchStripeConnectStatus();
      setStatus(next);
      if (next.businessType && !businessType) {
        setLocalBusinessType(next.businessType);
      }
    } catch (e) {
      setStatus(null);
      if (!compact) {
        toast.error(e instanceof Error ? e.message : t("stripeConnect.loadFailed"));
      }
    } finally {
      setLoading(false);
    }
  }, [businessType, compact, t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (businessType === "individual" || businessType === "company") {
      setLocalBusinessType(businessType);
    }
  }, [businessType]);

  useEffect(() => {
    const connect = searchParams.get("connect");
    if (connect !== "return" && connect !== "refresh") return;
    void loadStatus().then(() => {
      if (connect === "return") {
        toast.success(t("stripeConnect.returnToast"));
      } else {
        toast.message(t("stripeConnect.refreshToast"));
      }
    });
    const next = new URLSearchParams(searchParams);
    next.delete("connect");
    setSearchParams(next, { replace: true });
  }, [loadStatus, searchParams, setSearchParams, t]);

  const selectedBusinessType =
    businessType === "individual" || businessType === "company"
      ? businessType
      : localBusinessType || status?.businessType || "";

  const showBusinessTypeChoice =
    !!status?.requiresBusinessTypeChoice && !status?.accountId;

  const handleBusinessTypeChange = (value: StripeConnectBusinessType) => {
    setLocalBusinessType(value);
    onBusinessTypeChange?.(value);
  };

  const handleOnboard = async () => {
    if (showBusinessTypeChoice && selectedBusinessType !== "individual" && selectedBusinessType !== "company") {
      toast.error(t("stripeConnect.businessTypeRequired"));
      return;
    }
    setBusy(true);
    try {
      const url = await startStripeConnectOnboarding({
        returnPath: returnPath ?? "/admin",
        refreshPath: refreshPath ?? returnPath ?? "/admin",
        businessType:
          selectedBusinessType === "individual" || selectedBusinessType === "company"
            ? selectedBusinessType
            : undefined,
      });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("stripeConnect.onboardFailed"));
      setBusy(false);
    }
  };

  const handleDashboard = async () => {
    setBusy(true);
    try {
      const url = await openStripeConnectDashboard();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("stripeConnect.dashboardFailed"));
    } finally {
      setBusy(false);
    }
  };

  const ready = !!status?.ready;
  const started = !!status?.accountId;
  const needsAction = started && !ready;

  const statusBadge = ready ? (
    <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      {t("stripeConnect.statusReady")}
    </Badge>
  ) : needsAction ? (
    <Badge variant="secondary" className="text-amber-400 border-amber-500/30">
      <AlertCircle className="mr-1 h-3 w-3" />
      {t("stripeConnect.statusIncomplete")}
    </Badge>
  ) : (
    <Badge variant="outline">{t("stripeConnect.statusNotStarted")}</Badge>
  );

  const businessTypePicker = showBusinessTypeChoice ? (
    <div className="space-y-2">
      <Label className="text-sm">{t("stripeConnect.businessTypeLabel")}</Label>
      <RadioGroup
        className="space-y-2"
        value={selectedBusinessType || undefined}
        onValueChange={(value) => handleBusinessTypeChange(value as StripeConnectBusinessType)}
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[:checked]:border-gold has-[:checked]:bg-gold/5">
          <RadioGroupItem value="individual" className="mt-0.5" />
          <div>
            <p className="text-sm font-medium">{t("stripeConnect.businessTypeSoleTrader")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("stripeConnect.businessTypeSoleTraderHint")}</p>
          </div>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[:checked]:border-gold has-[:checked]:bg-gold/5">
          <RadioGroupItem value="company" className="mt-0.5" />
          <div>
            <p className="text-sm font-medium">{t("stripeConnect.businessTypeCompany")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("stripeConnect.businessTypeCompanyHint")}</p>
          </div>
        </label>
      </RadioGroup>
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{t("stripeConnect.title")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("stripeConnect.compactDesc")}</p>
          </div>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : statusBadge}
        </div>
        {businessTypePicker}
        <div className="flex flex-wrap gap-2">
          {!ready ? (
            <Button type="button" variant="gold" size="sm" onClick={() => void handleOnboard()} disabled={busy || loading}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {started ? t("stripeConnect.continueSetup") : t("stripeConnect.startSetup")}
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => void handleDashboard()} disabled={busy}>
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("stripeConnect.managePayouts")}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadStatus()} disabled={loading}>
            {t("common.refresh")}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("stripeConnect.stripeHostedNote")}</p>
      </div>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          {t("stripeConnect.title")}
        </CardTitle>
        <CardDescription>{t("stripeConnect.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">{statusBadge}</div>
            <p className="text-sm text-muted-foreground">
              {ready
                ? t("stripeConnect.readyBody")
                : started
                  ? t("stripeConnect.incompleteBody")
                  : t("stripeConnect.notStartedBody")}
            </p>
            {businessTypePicker}
            <div className="flex flex-wrap gap-2">
              {!ready ? (
                <Button type="button" variant="gold" size="sm" onClick={() => void handleOnboard()} disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {started ? t("stripeConnect.continueSetup") : t("stripeConnect.startSetup")}
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => void handleDashboard()} disabled={busy}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t("stripeConnect.managePayouts")}
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => void loadStatus()} disabled={loading}>
                {t("common.refresh")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("stripeConnect.stripeHostedNote")}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default StripeConnectCard;

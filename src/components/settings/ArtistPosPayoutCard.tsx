import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, ExternalLink, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchArtistStripeConnectStatus,
  openArtistStripeConnectDashboard,
  startArtistStripeConnectOnboarding,
  type ArtistStripeConnectStatus,
} from "@/lib/artistStripeConnect";

const ArtistPosPayoutCard = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<ArtistStripeConnectStatus | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchArtistStripeConnectStatus();
      setStatus(next);
      setVisible(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("artist_pos_connect_only") || msg.includes("Forbidden")) {
        setVisible(false);
        return;
      }
      setVisible(true);
      setStatus(null);
      toast.error(msg || t("artistStripeConnect.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const connect = searchParams.get("artistConnect");
    if (connect !== "return" && connect !== "refresh") return;
    void loadStatus().then(() => {
      if (connect === "return") {
        toast.success(t("artistStripeConnect.returnToast"));
      } else {
        toast.message(t("artistStripeConnect.refreshToast"));
      }
    });
    const next = new URLSearchParams(searchParams);
    next.delete("artistConnect");
    setSearchParams(next, { replace: true });
  }, [loadStatus, searchParams, setSearchParams, t]);

  const handleOnboard = async () => {
    setBusy(true);
    try {
      const url = await startArtistStripeConnectOnboarding({
        returnPath: "/settings",
        refreshPath: "/settings",
      });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("artistStripeConnect.onboardFailed"));
      setBusy(false);
    }
  };

  const handleDashboard = async () => {
    setBusy(true);
    try {
      const url = await openArtistStripeConnectDashboard();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("artistStripeConnect.dashboardFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!visible && !loading) return null;

  const ready = !!status?.ready;
  const started = !!status?.accountId;
  const needsAction = started && !ready;
  const shopReady = status?.shopReady !== false;

  const statusBadge = ready ? (
    <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      {t("artistStripeConnect.statusReady")}
    </Badge>
  ) : needsAction ? (
    <Badge variant="secondary" className="text-amber-400 border-amber-500/30">
      <AlertCircle className="mr-1 h-3 w-3" />
      {t("artistStripeConnect.statusIncomplete")}
    </Badge>
  ) : (
    <Badge variant="outline">{t("artistStripeConnect.statusNotStarted")}</Badge>
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          {t("artistStripeConnect.title")}
        </CardTitle>
        <CardDescription>{t("artistStripeConnect.desc")}</CardDescription>
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
            {!shopReady ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">{t("artistStripeConnect.shopNotReady")}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {ready
                  ? t("artistStripeConnect.readyBody", {
                      percent: status?.artistSplitPercent ?? "—",
                    })
                  : started
                    ? t("artistStripeConnect.incompleteBody")
                    : t("artistStripeConnect.notStartedBody")}
              </p>
            )}
            {status?.accountId ? (
              <p className="text-[11px] font-mono text-muted-foreground truncate">{status.accountId}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {!ready && shopReady ? (
                <Button type="button" variant="gold" size="sm" onClick={() => void handleOnboard()} disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {started ? t("artistStripeConnect.continueSetup") : t("artistStripeConnect.startSetup")}
                </Button>
              ) : ready ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void handleDashboard()} disabled={busy}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t("artistStripeConnect.managePayouts")}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={() => void loadStatus()} disabled={loading}>
                {t("common.refresh")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("artistStripeConnect.stripeHostedNote")}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ArtistPosPayoutCard;

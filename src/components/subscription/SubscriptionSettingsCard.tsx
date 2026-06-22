import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, ExternalLink, Loader2, ArrowDown, ArrowUp, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription, isSubscriptionActive, useArtistSeats } from "@/hooks/useSubscription";
import { usePricingPlansI18n } from "@/hooks/usePricingPlansI18n";
import { comparePlanOrder } from "@/lib/pricingPlans";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { useToast } from "@/hooks/use-toast";
import { safeFormatDate } from "@/lib/safeDateFormat";

const SubscriptionSettingsCard = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pricingPlans = usePricingPlansI18n();
  const { data, isLoading, canManageBilling } = useSubscription();
  const { data: seatUsage } = useArtistSeats();
  const { toast } = useToast();
  const [openingPortal, setOpeningPortal] = useState(false);
  const [changingPlanId, setChangingPlanId] = useState<string | null>(null);

  const openBillingPortal = async () => {
    setOpeningPortal(true);
    try {
      const { data: result, error } = await invokeEdgeFunctionJson<{ portalUrl?: string; error?: string }>(
        "create-billing-portal",
        {},
      );
      if (error || !result.portalUrl) {
        throw new Error(result.error || error?.message || t("subscription.portalUnavailable"));
      }
      window.location.href = result.portalUrl;
    } catch (e) {
      toast({
        title: t("subscription.portalUnavailable"),
        description: e instanceof Error ? e.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setOpeningPortal(false);
    }
  };

  const changePlan = async (planId: string) => {
    setChangingPlanId(planId);
    try {
      const { data: result, error } = await invokeEdgeFunctionJson<{
        ok?: boolean;
        alreadyOnPlan?: boolean;
        error?: string;
        code?: string;
      }>("change-platform-plan", { planId });

      if (error) {
        if (result.code === "checkout_required") {
          window.location.href = `/subscribe?plan=${planId}`;
          return;
        }
        throw new Error(result.error || error.message);
      }

      if (result.alreadyOnPlan) {
        toast({ title: t("subscription.alreadyOnPlan") });
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["organization-subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["artist-seat-usage"] });

      const planName = pricingPlans.find((p) => p.id === planId)?.name ?? planId;
      toast({
        title: t("subscription.planChanged"),
        description: t("subscription.planChangedDesc", { plan: planName }),
      });
    } catch (e) {
      toast({
        title: t("subscription.planChangeFailed"),
        description: e instanceof Error ? e.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setChangingPlanId(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const sub = data?.subscription;
  const plan = data?.plan;
  const marketingPlan = plan ? pricingPlans.find((p) => p.id === plan.id) : null;
  const planDisplayName = marketingPlan?.name ?? plan?.name;
  const active = isSubscriptionActive(sub?.status);
  const currentPlanId = sub?.planId ?? null;

  const statusLabels = {
    trialing: t("subscription.status.trialing"),
    active: t("subscription.status.active"),
    past_due: t("subscription.status.past_due"),
    canceled: t("subscription.status.canceled"),
    unpaid: t("subscription.status.unpaid"),
    incomplete: t("subscription.status.incomplete"),
    paused: t("subscription.status.paused"),
  };
  const statusKey = sub?.status as keyof typeof statusLabels | undefined;

  const canDowngradeTo = (targetMax: number) => (seatUsage?.used ?? 0) <= targetMax;
  const trialEndLabel = safeFormatDate(sub?.trialEnd, "d MMM yyyy");
  const renewsLabel = safeFormatDate(sub?.currentPeriodEnd, "d MMM yyyy");

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          {t("subscription.title")}
        </CardTitle>
        <CardDescription>
          {data?.organizationName
            ? t("subscription.billingFor", { name: data.organizationName })
            : t("subscription.manageDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sub && plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{planDisplayName}</span>
              <Badge variant={active ? "default" : "secondary"}>
                {statusKey ? statusLabels[statusKey] : sub.status}
              </Badge>
              {sub.cancelAtPeriodEnd ? (
                <Badge variant="outline">{t("subscription.cancelsAtPeriodEnd")}</Badge>
              ) : null}
            </div>
            {marketingPlan?.price ? (
              <p className="text-sm text-muted-foreground">
                {marketingPlan.price}
                {marketingPlan.period}
              </p>
            ) : null}
            {sub.trialEnd && sub.status === "trialing" && trialEndLabel ? (
              <p className="text-sm text-muted-foreground">
                {t("subscription.trialEnds", { date: trialEndLabel })}
              </p>
            ) : null}
            {sub.currentPeriodEnd && sub.status === "active" && renewsLabel ? (
              <p className="text-sm text-muted-foreground">
                {t("subscription.renews", { date: renewsLabel })}
              </p>
            ) : null}
            {plan.max_artist_seats ? (
              <p className="text-xs text-muted-foreground">
                {seatUsage
                  ? t("subscription.seatsInUse", { used: seatUsage.used, max: plan.max_artist_seats })
                  : t("subscription.upToSeats", { max: plan.max_artist_seats })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("subscription.unlimitedSeats")}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("subscription.noActive")}</p>
        )}

        {canManageBilling ? (
          <div className="space-y-3 pt-2">
            <p className="text-sm font-medium">{t("subscription.changePlanTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("subscription.changePlanDesc")}</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {pricingPlans.map((p) => {
                const isCurrent = currentPlanId === p.id && active;
                const direction =
                  currentPlanId && active
                    ? comparePlanOrder(p.id, currentPlanId)
                    : 0;
                const isUpgrade = direction > 0;
                const isDowngrade = direction < 0;
                const downgradeBlocked = isDowngrade && !canDowngradeTo(p.maxArtistSeats);
                const isChanging = changingPlanId === p.id;

                return (
                  <div
                    key={p.id}
                    className={`rounded-lg border p-3 space-y-2 ${
                      isCurrent ? "border-gold/50 bg-gold/5" : "border-border/70 bg-secondary/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.seats}</p>
                      </div>
                      {isCurrent ? (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          <Check className="h-3 w-3 mr-1" />
                          {t("subscription.currentPlan")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm font-semibold">
                      {p.price}
                      <span className="text-xs font-normal text-muted-foreground">{p.period}</span>
                    </p>
                    {!isCurrent ? (
                      active ? (
                        <Button
                          variant={isUpgrade ? "gold" : "outline"}
                          size="sm"
                          className="w-full"
                          disabled={!!changingPlanId || downgradeBlocked}
                          onClick={() => void changePlan(p.id)}
                        >
                          {isChanging ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : isUpgrade ? (
                            <ArrowUp className="mr-2 h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="mr-2 h-3.5 w-3.5" />
                          )}
                          {isUpgrade
                            ? t("subscription.upgradeTo", { plan: p.name })
                            : downgradeBlocked
                              ? t("subscription.downgradeBlocked")
                              : t("subscription.downgradeTo", { plan: p.name })}
                        </Button>
                      ) : (
                        <Button variant="gold-outline" size="sm" className="w-full" asChild>
                          <Link to={`/subscribe?plan=${p.id}`}>{p.cta}</Link>
                        </Button>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-2">
          {canManageBilling && active ? (
            <Button variant="outline" size="sm" onClick={openBillingPortal} disabled={openingPortal}>
              {openingPortal ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              {t("subscription.manageBilling")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default SubscriptionSettingsCard;

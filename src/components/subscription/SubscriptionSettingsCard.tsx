import { useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription, isSubscriptionActive, useArtistSeats } from "@/hooks/useSubscription";
import { usePricingPlansI18n } from "@/hooks/usePricingPlansI18n";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { useToast } from "@/hooks/use-toast";

const SubscriptionSettingsCard = () => {
  const { t } = useTranslation();
  const pricingPlans = usePricingPlansI18n();
  const { data, isLoading, canManageBilling } = useSubscription();
  const { data: seatUsage } = useArtistSeats();
  const { toast } = useToast();
  const [openingPortal, setOpeningPortal] = useState(false);

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
            {sub.trialEnd && sub.status === "trialing" ? (
              <p className="text-sm text-muted-foreground">
                {t("subscription.trialEnds", { date: format(new Date(sub.trialEnd), "d MMM yyyy") })}
              </p>
            ) : null}
            {sub.currentPeriodEnd && sub.status === "active" ? (
              <p className="text-sm text-muted-foreground">
                {t("subscription.renews", { date: format(new Date(sub.currentPeriodEnd), "d MMM yyyy") })}
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
          {canManageBilling ? (
            <Button variant="gold-outline" size="sm" asChild>
              <Link to={sub ? `/subscribe?plan=${sub.planId}` : "/subscribe"}>
                {active ? t("common.changePlan") : t("common.subscribeNow")}
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default SubscriptionSettingsCard;

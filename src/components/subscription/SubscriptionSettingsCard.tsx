import { useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription, isSubscriptionActive, useArtistSeats } from "@/hooks/useSubscription";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { useToast } from "@/hooks/use-toast";
import { getPlanById } from "@/lib/pricingPlans";

const statusLabel: Record<string, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  unpaid: "Unpaid",
  incomplete: "Incomplete",
  paused: "Paused",
};

const SubscriptionSettingsCard = () => {
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
        throw new Error(result.error || error?.message || "Could not open billing portal");
      }
      window.location.href = result.portalUrl;
    } catch (e) {
      toast({
        title: "Billing portal unavailable",
        description: e instanceof Error ? e.message : "Please try again later.",
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
  const marketingPlan = plan ? getPlanById(plan.id) : null;
  const active = isSubscriptionActive(sub?.status);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Subscription
        </CardTitle>
        <CardDescription>
          {data?.organizationName
            ? `Billing for ${data.organizationName}`
            : "Manage your VexMy platform subscription"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sub && plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{plan.name}</span>
              <Badge variant={active ? "default" : "secondary"}>
                {statusLabel[sub.status] ?? sub.status}
              </Badge>
              {sub.cancelAtPeriodEnd ? (
                <Badge variant="outline">Cancels at period end</Badge>
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
                Trial ends {format(new Date(sub.trialEnd), "d MMM yyyy")}
              </p>
            ) : null}
            {sub.currentPeriodEnd && sub.status === "active" ? (
              <p className="text-sm text-muted-foreground">
                Renews {format(new Date(sub.currentPeriodEnd), "d MMM yyyy")}
              </p>
            ) : null}
            {plan.max_artist_seats ? (
              <p className="text-xs text-muted-foreground">
                {seatUsage ? `${seatUsage.used} / ${plan.max_artist_seats} artist seats in use` : `Up to ${plan.max_artist_seats} artist seats`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Unlimited artist seats</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No active subscription. Choose a plan to unlock the full platform.
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {canManageBilling && active ? (
            <Button variant="outline" size="sm" onClick={openBillingPortal} disabled={openingPortal}>
              {openingPortal ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Manage billing
            </Button>
          ) : null}
          {canManageBilling ? (
            <Button variant="gold-outline" size="sm" asChild>
              <Link to={sub ? `/subscribe?plan=${sub.planId}` : "/subscribe"}>
                {active ? "Change plan" : "Subscribe now"}
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default SubscriptionSettingsCard;

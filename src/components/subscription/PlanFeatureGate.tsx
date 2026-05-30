import { Link } from "react-router-dom";
import { Crown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription, type PlanFeatures } from "@/hooks/useSubscription";
import { getPlanById } from "@/lib/pricingPlans";

type PlanFeatureGateProps = {
  feature: keyof PlanFeatures;
  children: React.ReactNode;
  /** Minimum plan that includes this feature (for messaging). */
  requiredPlanId?: "studio" | "enterprise";
};

const PlanFeatureGate = ({ feature, children, requiredPlanId = "studio" }: PlanFeatureGateProps) => {
  const { isLoading, hasFeature, isActive } = useSubscription();
  const requiredPlan = getPlanById(requiredPlanId);

  if (isLoading) return <>{children}</>;

  if (isActive && hasFeature(feature)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-lg py-12 px-4">
      <Card className="border-[#d4af37]/30 bg-card/80">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#d4af37]/10">
            <Lock className="h-6 w-6 text-[#d4af37]" />
          </div>
          <CardTitle className="font-display">Upgrade required</CardTitle>
          <CardDescription>
            This feature is included on the {requiredPlan?.name ?? "Studio"} plan and above.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Button variant="gold" asChild>
            <Link to={`/subscribe?plan=${requiredPlanId}`}>
              <Crown className="mr-2 h-4 w-4" />
              Upgrade to {requiredPlan?.name ?? "Studio"}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/pricing">Compare plans</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlanFeatureGate;

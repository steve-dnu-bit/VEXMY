import { Link } from "react-router-dom";
import { Crown, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription, type PlanFeatures } from "@/hooks/useSubscription";
import { usePricingPlansI18n } from "@/hooks/usePricingPlansI18n";

type PlanFeatureGateProps = {
  feature: keyof PlanFeatures;
  children: React.ReactNode;
  requiredPlanId?: "studio" | "enterprise";
};

const PlanFeatureGate = ({ feature, children, requiredPlanId = "studio" }: PlanFeatureGateProps) => {
  const { t } = useTranslation();
  const pricingPlans = usePricingPlansI18n();
  const { isLoading, hasFeature, isActive } = useSubscription();
  const requiredPlan = pricingPlans.find((p) => p.id === requiredPlanId);
  const planName = requiredPlan?.name ?? "Studio";

  if (isLoading) return <>{children}</>;

  if (isActive && hasFeature(feature)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-lg py-12 px-4">
      <Card className="border-[#d4af37]/30 bg-card/80">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#d4af37]/10">
            <Lock className="h-6 w-6 text-[#d4af37]" />
          </div>
          <CardTitle className="font-display">{t("subscription.upgradeRequired")}</CardTitle>
          <CardDescription>
            {t("subscription.upgradeRequiredDesc", { plan: planName })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Button variant="gold" asChild>
            <Link to={`/subscribe?plan=${requiredPlanId}`}>
              <Crown className="mr-2 h-4 w-4" />
              {t("subscription.upgradeTo", { plan: planName })}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/pricing">{t("common.comparePlans")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlanFeatureGate;

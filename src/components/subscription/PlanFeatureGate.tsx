import { Link } from "react-router-dom";
import { Crown, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription, type PlanFeatures } from "@/hooks/useSubscription";

type PlanFeatureGateProps = {
  feature: keyof PlanFeatures;
  children: React.ReactNode;
};

const PlanFeatureGate = ({ feature, children }: PlanFeatureGateProps) => {
  const { t } = useTranslation();
  const { isLoading, hasFeature, isActive } = useSubscription();

  if (isLoading) return <>{children}</>;

  if (isActive && hasFeature(feature)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-lg py-12 px-4">
      <Card className="border-gold/30 bg-card/80">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold/10">
            <Lock className="h-6 w-6 text-gold" />
          </div>
          <CardTitle className="font-display">{t("subscription.upgradeRequired")}</CardTitle>
          <CardDescription>{t("subscription.upgradeRequiredDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Button variant="gold" asChild>
            <Link to="/subscribe?plan=studio">
              <Crown className="mr-2 h-4 w-4" />
              {t("common.subscribeNow")}
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

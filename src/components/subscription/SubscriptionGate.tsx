import { Link } from "react-router-dom";
import { Crown, Loader2, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useArtistSeats, useSubscription } from "@/hooks/useSubscription";
import { isNativeApp } from "@/lib/platform";

/**
 * Blocks pages that require a paid platform subscription.
 * Uses both subscription status and seat-usage RPC (reliable across RLS / multi-tenant).
 */
const SubscriptionGate = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const { isLoading: subLoading, isActive } = useSubscription();
  const { data: seats, isLoading: seatLoading } = useArtistSeats();

  if (subLoading || seatLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isActive || seats?.planId) return <>{children}</>;

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
            <Link to={isNativeApp() ? "/billing" : "/subscribe?plan=enterprise"}>
              <Crown className="mr-2 h-4 w-4" />
              {t("common.subscribeNow")}
            </Link>
          </Button>
          {!isNativeApp() ? (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/pricing">{t("common.comparePlans")}</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionGate;

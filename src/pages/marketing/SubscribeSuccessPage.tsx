import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";

const SubscribeSuccessPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading, refetch, isActive } = useSubscription();
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (!sessionId || isActive) return;
    if (pollCount >= 8) return;

    const timer = window.setTimeout(() => {
      refetch();
      setPollCount((c) => c + 1);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [sessionId, isActive, pollCount, refetch]);

  const waitingForWebhook = !!sessionId && !isActive && pollCount < 8;

  return (
    <MarketingLayout>
      <section className="mx-auto max-w-lg px-4 py-20 text-center">
        {authLoading || (isLoading && !data) ? (
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold" />
        ) : waitingForWebhook ? (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold" />
            <h1 className="mt-6 font-display text-2xl font-bold">{t("subscribe.confirming")}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{t("subscribe.confirmingHint")}</p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold/15">
              <CheckCircle2 className="h-8 w-8 text-gold" />
            </div>
            <h1 className="mt-6 font-display text-3xl font-bold">{t("subscribe.allSet")}</h1>
            <p className="mt-3 text-muted-foreground">
              {data?.plan?.name ? (
                t("subscribe.planActive", {
                  plan: data.plan.name,
                  trial: data.subscription?.status === "trialing" ? t("subscribe.withTrial") : "",
                })
              ) : (
                t("subscribe.confirming")
              )}
            </p>
            {data?.organizationName ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("common.studioName")}: {data.organizationName}
              </p>
            ) : null}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              {user ? (
                <Button variant="gold" asChild>
                  <Link to="/shop-setup">{t("setup.startSetup")}</Link>
                </Button>
              ) : (
                <Button variant="gold" asChild>
                  <Link to="/auth">{t("subscribe.signInStudio")}</Link>
                </Button>
              )}
              <Button variant="gold-outline" asChild>
                <Link to="/admin#subscription">{t("subscription.title")}</Link>
              </Button>
            </div>
          </>
        )}
      </section>
    </MarketingLayout>
  );
};

export default SubscribeSuccessPage;

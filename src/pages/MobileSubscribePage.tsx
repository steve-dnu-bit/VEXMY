import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Globe, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import VelbokBrand from "@/components/brand/VelbokBrand";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricingPlansI18n } from "@/hooks/usePricingPlansI18n";
import { supabase } from "@/integrations/supabase/client";

/**
 * Native-only informational plans page. No in-app purchase: Apple guideline 3.1.1
 * forbids selling SaaS subscriptions through Stripe inside the iOS app, so new
 * studios complete their subscription on the Velbok website instead.
 */
const MobileSubscribePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pricingPlans = usePricingPlansI18n();
  const { isActive } = useSubscription();

  const initialPlan = (searchParams.get("plan") || "studio").toLowerCase();
  const [selectedId, setSelectedId] = useState(
    pricingPlans.some((p) => p.id === initialPlan) ? initialPlan : "studio",
  );

  useEffect(() => {
    if (isActive) navigate("/schedule", { replace: true });
  }, [isActive, navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background px-4 pb-10 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="mx-auto max-w-md space-y-6">
        <div className="text-center">
          <VelbokBrand className="mx-auto" />
          <h1 className="mt-4 font-display text-2xl font-bold">
            {t("subscribe.mobilePlansTitle", { defaultValue: "Velbok for studios" })}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("subscribe.mobileSubtitle")}
          </p>
        </div>

        <Card className="border-gold/40 bg-gold/5">
          <CardContent className="flex items-start gap-3 p-4">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("subscribe.manageOnWebNotice", {
                defaultValue:
                  "Studio subscriptions are set up on the Velbok website. Once your studio is subscribed, sign in here with the same account and everything unlocks automatically.",
              })}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {pricingPlans.map((plan) => {
            const selected = plan.id === selectedId;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedId(plan.id)}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? "border-gold bg-gold/10"
                    : "border-border/70 bg-card/55 hover:border-gold/50"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg font-semibold">
                    {plan.name}
                    {plan.highlighted ? (
                      <Badge variant="outline" className="ml-2 border-gold/60 text-[10px] text-gold">
                        {t("pricing.mostPopular", { defaultValue: "Most popular" })}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="font-display text-lg font-bold text-gold">
                    {plan.price}
                    <span className="text-xs font-normal text-muted-foreground"> {plan.period}</span>
                  </span>
                </div>
                <p className="mt-0.5 text-xs font-medium text-foreground/80">{plan.seats}</p>
                <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
                {selected ? (
                  <>
                    <p className="mt-2 text-xs text-gold/80">
                      {plan.id === "enterprise"
                        ? t("subscribe.trialNoteImmediate")
                        : t("subscribe.trialNote")}
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>

        <Card className="border-border/60 bg-card/40">
          <CardContent className="flex items-start gap-3 p-4">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("subscribe.clientInviteNotice")}
            </p>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-4 text-xs">
          <Link to="/account" className="text-muted-foreground hover:text-foreground">
            {t("subscribe.backToAccount")}
          </Link>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => void handleSignOut()}
          >
            {t("common.signOut")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileSubscribePage;

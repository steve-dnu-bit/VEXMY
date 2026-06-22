import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePricingPlansI18n } from "@/hooks/usePricingPlansI18n";

const LANDING_FEATURE_COUNT = 4;

const LandingPricingSection = () => {
  const { t } = useTranslation();
  const pricingPlans = usePricingPlansI18n();

  return (
    <section id="pricing" className="border-t border-gold/10 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">{t("common.pricing")}</p>
          <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{t("landing.pricingTitle")}</h2>
          <p className="mt-4 text-muted-foreground">{t("landing.pricingSubtitle")}</p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {pricingPlans.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.highlighted
                  ? "border-gold/50 bg-[#101216]/90 shadow-gold"
                  : "border-border/70 bg-card/55"
              }`}
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold px-3 py-0.5 text-xs font-semibold text-[#090a0f]">
                  {t("marketing.mostPopular")}
                </span>
              ) : null}
              <p className="text-xs font-medium uppercase tracking-wider text-gold/70">{plan.tagline}</p>
              <h3 className="mt-1 font-display text-xl font-bold">{plan.name}</h3>
              <p className="mt-4 font-display text-3xl font-bold text-gold">
                {plan.price}
                <span className="text-sm font-normal text-muted-foreground">{plan.period}</span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{plan.seats}</p>
              <ul className="mt-5 flex-1 space-y-2">
                {plan.features.slice(0, LANDING_FEATURE_COUNT).map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.highlighted ? "gold" : "gold-outline"}
                size="sm"
                className="mt-6 w-full"
                asChild
              >
                <Link to={plan.ctaHref}>{plan.cta}</Link>
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Button variant="ghost" asChild>
            <Link to="/pricing">
              {t("landing.pricingCompare")}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default LandingPricingSection;

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { PricingPlan } from "@/lib/pricingPlans";
import { PLAN_ARTIST_SEATS, PLAN_PRICES_GBP, formatPlanPriceGbp } from "@/lib/pricingPlans";

const SHARED_FEATURE_KEYS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export function usePricingPlansI18n(): PricingPlan[] {
  const { t } = useTranslation();

  return useMemo(() => {
    const planIds = ["starter", "studio", "enterprise"] as const;
    return planIds.map((id) => ({
      id,
      name: t(`pricing.${id}.name`),
      price: formatPlanPriceGbp(PLAN_PRICES_GBP[id]),
      period: t("common.month"),
      tagline: t(`pricing.${id}.tagline`),
      description: t(`pricing.${id}.description`),
      seats: t(`pricing.${id}.seats`),
      maxArtistSeats: PLAN_ARTIST_SEATS[id],
      features: SHARED_FEATURE_KEYS.map((i) => t(`pricing.sharedFeatures.${i}`)),
      cta: t(`pricing.${id}.cta`),
      ctaHref: `/subscribe?plan=${id}`,
      highlighted: id === "studio",
    }));
  }, [t]);
}

export function usePricingFaqI18n() {
  const { t } = useTranslation();
  return useMemo(
    () => [
      { q: t("pricing.faq.trialQ"), a: t("pricing.faq.trialA") },
      { q: t("pricing.faq.includedQ"), a: t("pricing.faq.includedA") },
      { q: t("pricing.faq.stripeFeesQ"), a: t("pricing.faq.stripeFeesA") },
      { q: t("pricing.faq.switchQ"), a: t("pricing.faq.switchA") },
      { q: t("pricing.faq.migrateQ"), a: t("pricing.faq.migrateA") },
    ],
    [t],
  );
}

export function useComparisonRowsI18n() {
  const { t } = useTranslation();
  const yes = t("pricing.comparison.included");
  return useMemo(
    () => [
      {
        label: t("pricing.comparison.monthlyPrice"),
        starter: formatPlanPriceGbp(PLAN_PRICES_GBP.starter),
        studio: formatPlanPriceGbp(PLAN_PRICES_GBP.studio),
        enterprise: formatPlanPriceGbp(PLAN_PRICES_GBP.enterprise),
      },
      { label: t("pricing.comparison.artistSeats"), starter: "3", studio: "6", enterprise: "10" },
      { label: t("pricing.comparison.fullPlatform"), starter: yes, studio: yes, enterprise: yes },
    ],
    [t, yes],
  );
}

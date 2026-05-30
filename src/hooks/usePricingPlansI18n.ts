import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { PricingPlan } from "@/lib/pricingPlans";

export function usePricingPlansI18n(): PricingPlan[] {
  const { t } = useTranslation();

  return useMemo(() => {
    const planIds = ["starter", "studio", "enterprise"] as const;
    return planIds.map((id) => {
      const featureKeys = id === "starter" ? [0, 1, 2, 3, 4, 5] : id === "studio" ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5];
      return {
        id,
        name: t(`pricing.${id}.name`),
        price: id === "starter" ? "£29.50" : id === "studio" ? "£39.50" : "£59.50",
        period: t("common.month"),
        tagline: t(`pricing.${id}.tagline`),
        description: t(`pricing.${id}.description`),
        seats: t(`pricing.${id}.seats`),
        features: featureKeys.map((i) => t(`pricing.${id}.features.${i}`)),
        cta: t(`pricing.${id}.cta`),
        ctaHref: `/subscribe?plan=${id}`,
        highlighted: id === "studio",
      };
    });
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
  const no = t("pricing.comparison.notIncluded");
  return useMemo(
    () => [
      { label: t("pricing.comparison.monthlyPrice"), starter: "£29.50", studio: "£39.50", enterprise: "£59.50" },
      { label: t("pricing.comparison.artistSeats"), starter: "3", studio: "6", enterprise: "10" },
      { label: t("pricing.comparison.scheduleCrm"), starter: yes, studio: yes, enterprise: yes },
      { label: t("pricing.comparison.consentForms"), starter: yes, studio: yes, enterprise: yes },
      { label: t("pricing.comparison.customerPortal"), starter: yes, studio: yes, enterprise: yes },
      { label: t("pricing.comparison.stripeDeposits"), starter: no, studio: yes, enterprise: yes },
      { label: t("pricing.comparison.invoicing"), starter: no, studio: yes, enterprise: yes },
      { label: t("pricing.comparison.staffInbox"), starter: no, studio: yes, enterprise: yes },
      { label: t("pricing.comparison.stockManagement"), starter: no, studio: yes, enterprise: yes },
      { label: t("pricing.comparison.dedicatedOnboarding"), starter: no, studio: no, enterprise: yes },
      { label: t("pricing.comparison.sla"), starter: no, studio: no, enterprise: yes },
    ],
    [t, yes, no],
  );
}

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { PricingPlan } from "@/lib/pricingPlans";
import {
  PLAN_ARTIST_SEATS,
  PLAN_INBOX_FEATURES,
  PLAN_ORDER,
  PLAN_STENCIL_MAX_PER_24H,
  PLAN_TICKET_MEDIA_MAX,
  formatPlanPrice,
  getPlanPricesForCurrency,
} from "@/lib/pricingPlans";
import { usePricingCurrency } from "@/hooks/usePricingCurrency";

const CORE_FEATURE_KEYS = [0, 1, 2, 3, 4, 5, 6] as const;
const INBOX_FEATURE_KEYS: Record<string, readonly number[]> = {
  solo: [0, 1, 2],
  starter: [0, 1, 2],
  studio: [0, 1],
  enterprise: [0, 1, 2],
};

export function usePricingPlansI18n(): PricingPlan[] {
  const { t } = useTranslation();
  const currency = usePricingCurrency();
  const prices = getPlanPricesForCurrency(currency);

  return useMemo(() => {
    return PLAN_ORDER.map((id) => ({
      id,
      name: t(`pricing.${id}.name`),
      price: formatPlanPrice(prices[id], currency),
      period: t("common.month"),
      tagline: t(`pricing.${id}.tagline`),
      description: t(`pricing.${id}.description`),
      seats: t(`pricing.${id}.seats`),
      maxArtistSeats: PLAN_ARTIST_SEATS[id],
      features: [
        ...CORE_FEATURE_KEYS.map((i) => t(`pricing.coreFeatures.${i}`)),
        ...INBOX_FEATURE_KEYS[id].map((i) => t(`pricing.inboxFeatures.${id}.${i}`)),
      ],
      cta: t(`pricing.${id}.cta`),
      ctaHref: `/subscribe?plan=${id}`,
      highlighted: id === "studio",
    }));
  }, [t, currency, prices]);
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
  const currency = usePricingCurrency();
  const prices = getPlanPricesForCurrency(currency);
  const dash = t("pricing.comparison.notIncluded");
  const included = t("pricing.comparison.included");

  return useMemo(
    () => [
      {
        label: t("pricing.comparison.monthlyPrice"),
        solo: formatPlanPrice(prices.solo, currency),
        starter: formatPlanPrice(prices.starter, currency),
        studio: formatPlanPrice(prices.studio, currency),
        enterprise: formatPlanPrice(prices.enterprise, currency),
      },
      {
        label: t("pricing.comparison.artistSeats"),
        solo: String(PLAN_ARTIST_SEATS.solo),
        starter: String(PLAN_ARTIST_SEATS.starter),
        studio: String(PLAN_ARTIST_SEATS.studio),
        enterprise: String(PLAN_ARTIST_SEATS.enterprise),
      },
      {
        label: t("pricing.comparison.ticketImages"),
        solo: String(PLAN_TICKET_MEDIA_MAX.solo),
        starter: String(PLAN_TICKET_MEDIA_MAX.starter),
        studio: String(PLAN_TICKET_MEDIA_MAX.studio),
        enterprise: String(PLAN_TICKET_MEDIA_MAX.enterprise),
      },
      {
        label: t("pricing.comparison.stencilsPerDay"),
        solo: String(PLAN_STENCIL_MAX_PER_24H.solo),
        starter: String(PLAN_STENCIL_MAX_PER_24H.starter),
        studio: String(PLAN_STENCIL_MAX_PER_24H.studio),
        enterprise: String(PLAN_STENCIL_MAX_PER_24H.enterprise),
      },
      {
        label: t("pricing.comparison.contactCentre"),
        solo: included,
        starter: included,
        studio: included,
        enterprise: included,
      },
      {
        label: t("pricing.comparison.unifiedInbox"),
        solo: dash,
        starter: dash,
        studio: t("pricing.comparison.inboxStudio"),
        enterprise: t("pricing.comparison.inboxEnterprise"),
      },
    ],
    [t, dash, included, currency, prices],
  );
}

import { useTranslation } from "react-i18next";

export function PlanTrialBadge({ planId }: { planId: string }) {
  const { t } = useTranslation();
  if (planId === "enterprise") {
    return (
      <span className="mt-2 inline-block rounded-full border border-border/80 bg-secondary/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        {t("pricing.paidImmediatelyBadge")}
      </span>
    );
  }
  return (
    <span className="mt-2 inline-block rounded-full border border-gold/35 bg-gold/10 px-2.5 py-0.5 text-xs font-medium text-gold/90">
      {t("pricing.trialBadge")}
    </span>
  );
}

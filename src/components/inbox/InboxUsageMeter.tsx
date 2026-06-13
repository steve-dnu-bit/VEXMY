import { useTranslation } from "react-i18next";

import type { InboxUsageSnapshot } from "@/hooks/useInboxPlan";



export default function InboxUsageMeter({ usage }: { usage: InboxUsageSnapshot | null }) {

  const { t } = useTranslation();

  if (!usage || usage.monthlyCap <= 0) {

    return <p className="text-xs text-muted-foreground">{t("unifiedInbox.usageUnlimited")}</p>;

  }



  const pct = Math.min(100, Math.round((usage.totalCount / usage.monthlyCap) * 100));

  const warn80 = pct >= 80 && pct < 100 && !usage.inOverage;



  return (

    <div className="space-y-1">

      <div className="flex justify-between text-xs text-muted-foreground">

        <span>{t("unifiedInbox.usage", { used: usage.totalCount, cap: usage.monthlyCap })}</span>

        <span>

          {usage.inOverage

            ? t("unifiedInbox.overageActive", { count: usage.overageCount })

            : t("unifiedInbox.remaining", { count: usage.remaining })}

        </span>

      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden">

        <div

          className={`h-full rounded-full transition-all ${

            usage.inOverage || pct >= 100 ? "bg-destructive" : warn80 ? "bg-amber-500" : "bg-gold"

          }`}

          style={{ width: `${pct}%` }}

        />

      </div>

      {warn80 ? (

        <p className="text-[10px] text-amber-600 dark:text-amber-400">{t("unifiedInbox.warn80")}</p>

      ) : null}

      {usage.inOverage && usage.overageRateGbp > 0 ? (

        <p className="text-[10px] text-muted-foreground">

          {t("unifiedInbox.overageRate", { rate: usage.overageRateGbp.toFixed(2) })}

        </p>

      ) : null}

    </div>

  );

}


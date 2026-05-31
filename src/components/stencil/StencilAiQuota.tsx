import { Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { STENCIL_AI_MAX_PER_MONTH } from "@/lib/stencilAi";

type StencilAiQuotaProps = {
  remaining: number | null;
  loading?: boolean;
  className?: string;
};

export function StencilAiQuota({ remaining, loading, className }: StencilAiQuotaProps) {
  const { t } = useTranslation();
  const max = STENCIL_AI_MAX_PER_MONTH;
  const left = remaining ?? max;
  const used = max - left;
  const ratio = max > 0 ? left / max : 0;
  const depleted = !loading && left <= 0;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 sm:px-4",
        depleted ? "border-destructive/40 bg-destructive/5" : "border-border bg-secondary/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className={cn("h-4 w-4 shrink-0", depleted ? "text-destructive" : "text-primary")} />
          <div className="min-w-0">
            <p className="text-xs font-medium leading-snug">{t("stencil.aiQuotaTitle")}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{t("stencil.aiQuotaSubtitle")}</p>
          </div>
        </div>

        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <p
            className={cn(
              "shrink-0 text-right font-display text-lg font-bold tabular-nums leading-none",
              depleted ? "text-destructive" : "text-primary",
            )}
          >
            {left}
            <span className="text-xs font-normal text-muted-foreground">/{max}</span>
          </p>
        )}
      </div>

      {!loading && (
        <>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-background/80">
            <div
              className={cn("h-full rounded-full transition-all", depleted ? "bg-destructive" : "bg-primary")}
              style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            {depleted
              ? t("stencil.aiQuotaDepleted")
              : t("stencil.aiQuotaRemaining", { count: left, used, max })}
          </p>
        </>
      )}
    </div>
  );
}

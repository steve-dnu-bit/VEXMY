import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle2, X } from "lucide-react";
import { BRANDING } from "@/lib/branding";
import { useComparisonRowsI18n, usePricingFaqI18n, usePricingPlansI18n } from "@/hooks/usePricingPlansI18n";

const PricingPage = () => {
  const { t } = useTranslation();
  const pricingPlans = usePricingPlansI18n();
  const pricingFaq = usePricingFaqI18n();
  const comparisonRows = useComparisonRowsI18n();

  return (
    <MarketingLayout>
      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">{t("common.pricing")}</p>
          <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">{t("marketing.pricingTitle")}</h1>
          <p className="mt-4 text-lg text-muted-foreground">{t("marketing.pricingSubtitle")}</p>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-8 lg:grid-cols-3">
          {pricingPlans.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-8 ${
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
              <h2 className="mt-1 font-display text-2xl font-bold">{plan.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
              <p className="mt-6 font-display text-4xl font-bold text-gold">
                {plan.price}
                {plan.period ? <span className="text-base font-normal text-muted-foreground">{plan.period}</span> : null}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{plan.seats}</p>
              <ul className="mt-8 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button variant={plan.highlighted ? "gold" : "gold-outline"} className="mt-8 w-full" asChild>
                <Link to={plan.ctaHref}>{plan.cta}</Link>
              </Button>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-20 max-w-5xl">
          <h2 className="text-center font-display text-2xl font-bold sm:text-3xl">{t("marketing.comparePlans")}</h2>
          <div className="mt-8 overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[540px] text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-card/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("marketing.comparePlans")}</th>
                  <th className="px-4 py-3 text-center font-medium">Starter</th>
                  <th className="px-4 py-3 text-center font-medium text-gold">Studio</th>
                  <th className="px-4 py-3 text-center font-medium">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="border-b border-border/40">
                    <td className="px-4 py-3 text-muted-foreground">{row.label}</td>
                    <td className="px-4 py-3 text-center">{row.starter === "—" ? <X className="mx-auto h-4 w-4 text-muted-foreground/50" /> : row.starter}</td>
                    <td className="px-4 py-3 text-center bg-gold/5">{row.studio === "—" ? <X className="mx-auto h-4 w-4 text-muted-foreground/50" /> : row.studio}</td>
                    <td className="px-4 py-3 text-center">{row.enterprise === "—" ? <X className="mx-auto h-4 w-4 text-muted-foreground/50" /> : row.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mx-auto mt-20 max-w-3xl">
          <h2 className="text-center font-display text-2xl font-bold">{t("marketing.pricingFaq")}</h2>
          <dl className="mt-10 space-y-4">
            {pricingFaq.map(({ q, a }) => (
              <div key={q} className="rounded-lg border border-border/70 bg-card/55 p-5">
                <dt className="font-medium">{q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-gold/25 bg-[#101216]/80 p-8 text-center">
          <h2 className="font-display text-xl font-bold">{t("marketing.notSurePlan")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("marketing.notSurePlanBody")}</p>
          <Button variant="gold" className="mt-6" asChild>
            <Link to="/contact">{t("common.contact")}</Link>
          </Button>
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-muted-foreground">
          {t("marketing.pricesGbp")}{" "}
          <a href={`mailto:${BRANDING.supportEmail}`} className="text-gold hover:underline">
            {BRANDING.supportEmail}
          </a>
        </p>
      </section>
    </MarketingLayout>
  );
};

export default PricingPage;

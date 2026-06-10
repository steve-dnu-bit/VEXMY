import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const POINTS = ["landing.stripePoint1", "landing.stripePoint2", "landing.stripePoint3", "landing.stripePoint4"] as const;

const LandingStripeSection = () => {
  const { t } = useTranslation();

  return (
    <section className="border-y border-gold/10 bg-[#0a0b10]/80 px-4 py-20 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold/80">{t("landing.stripeBadge")}</p>
          <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{t("landing.stripeTitle")}</h2>
          <p className="mt-4 max-w-xl text-muted-foreground">{t("landing.stripeBody")}</p>
          <ul className="mt-6 space-y-3">
            {POINTS.map((key) => (
              <li key={key} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#635BFF]" />
                {t(key)}
              </li>
            ))}
          </ul>
          <Button variant="gold-outline" size="lg" className="mt-8" asChild>
            <Link to="/pricing">
              {t("landing.stripeCta")}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="rounded-2xl border border-[#635BFF]/25 bg-gradient-to-br from-[#635BFF]/10 via-transparent to-gold/5 p-8 sm:p-10">
          <div className="flex flex-col items-center text-center">
            <img src="/marketing/stripe-wordmark.svg" alt="Stripe" className="h-10 w-auto sm:h-12" />
            <p className="mt-6 text-sm text-muted-foreground">{t("landing.stripePowered")}</p>
            <div className="mt-6 grid w-full max-w-xs grid-cols-2 gap-3 text-left text-xs">
              {[
                { label: t("landing.stripeCardDeposits"), value: "✓" },
                { label: t("landing.stripeCardInvoices"), value: "✓" },
                { label: t("landing.stripeCardConnect"), value: "✓" },
                { label: t("landing.stripeCardWebhook"), value: "✓" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
                  <p className="text-muted-foreground">{item.label}</p>
                  <p className="mt-1 font-semibold text-[#635BFF]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingStripeSection;

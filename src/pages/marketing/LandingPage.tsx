import { Link } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import LandingFeatureTour from "@/components/marketing/landing/LandingFeatureTour";
import LandingScreenshotGallery from "@/components/marketing/landing/LandingScreenshotGallery";
import LandingStripeSection from "@/components/marketing/landing/LandingStripeSection";
import LandingSupportedCountries from "@/components/marketing/landing/LandingSupportedCountries";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight, CheckCircle2 } from "lucide-react";
import { useLandingI18n } from "@/hooks/useLandingI18n";

const LandingPage = () => {
  const { features, steps, audiences, faqs, previewSlots, heroSubtitle, t } = useLandingI18n();

  return (
    <MarketingLayout>
      <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:pb-28">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[28vw] opacity-40 [background-image:url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20320%20900%27%3E%3Cpath%20d%3D%27M20%2040%20C130%2080%20150%20190%2085%20280%20C35%20350%2042%20430%20128%20500%27%20fill%3D%27none%27%20stroke%3D%27%23d4af37%27%20stroke-opacity%3D%270.25%27%20stroke-width%3D%272%27%2F%3E%3C%2Fsvg%3E')] bg-contain bg-left bg-no-repeat" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[28vw] opacity-40 [background-image:url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20320%20900%27%3E%3Cpath%20d%3D%27M300%2040%20C190%2080%20170%20190%20235%20280%20C285%20350%20278%20430%20192%20500%27%20fill%3D%27none%27%20stroke%3D%27%23d4af37%27%20stroke-opacity%3D%270.25%27%20stroke-width%3D%272%27%2F%3E%3C%2Fsvg%3E')] bg-contain bg-right bg-no-repeat" />

        <div className="relative mx-auto max-w-4xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-4 py-1.5 text-xs tracking-wide text-gold">
            <Shield className="h-3.5 w-3.5" />
            {t("landing.heroBadge")}
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            {t("landing.heroTitle1")}
            <span className="block text-gold">{t("landing.heroTitle2")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{heroSubtitle}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button variant="gold" size="lg" asChild className="min-w-[200px]">
              <Link to="/contact">
                {t("landing.getStarted")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="gold-outline" size="lg" asChild className="min-w-[200px]">
              <Link to="/pricing">{t("landing.viewPricing")}</Link>
            </Button>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            {t("landing.alreadyHaveStudio")}{" "}
            <Link to="/auth" className="text-gold hover:underline">
              {t("landing.signInApp")}
            </Link>
          </p>
        </div>

        <div className="relative mx-auto mt-16 max-w-5xl px-2">
          <div className="rounded-2xl border border-gold/25 bg-[#101216]/80 p-1 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-sm">
            <div className="rounded-xl border border-border/50 bg-[#0c0d12] p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between border-b border-border/40 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gold/70">{t("landing.previewDashboard")}</p>
                  <p className="font-display text-lg font-semibold">{t("landing.previewToday")}</p>
                </div>
                <div className="flex gap-2">
                  <span className="rounded-md bg-gold/15 px-2 py-1 text-xs text-gold">{t("landing.previewBookings")}</span>
                  <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs text-emerald-400">{t("landing.previewDeposits")}</span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {previewSlots.map((slot) => (
                  <div key={slot.time} className="rounded-lg border border-border/60 bg-card/50 p-4 text-sm">
                    <p className="text-muted-foreground">{slot.time}</p>
                    <p className="mt-1 font-medium">{slot.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingFeatureTour />
      <LandingScreenshotGallery />
      <LandingStripeSection />
      <LandingSupportedCountries />

      <section id="features" className="border-t border-gold/10 bg-[#0a0b10]/80 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">{t("landing.featuresTitle")}</h2>
            <p className="mt-4 text-muted-foreground">{t("landing.featuresSubtitle")}</p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group rounded-xl border border-border/70 bg-card/55 p-6 transition-colors hover:border-gold/40 hover:bg-card/75"
              >
                <div className="mb-4 inline-flex rounded-lg bg-gold/10 p-2.5 text-gold">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">{t("landing.howItWorks")}</h2>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {steps.map(({ step, title, body }) => (
              <div key={step} className="relative rounded-xl border border-gold/20 bg-[#101216]/60 p-8">
                <span className="font-display text-4xl font-bold text-gold/25">{step}</span>
                <h3 className="mt-2 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-gold/10 bg-[#0a0b10]/80 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center font-display text-3xl font-bold">{t("landing.audiencesTitle")}</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {audiences.map(({ title, points }) => (
              <div key={title} className="rounded-xl border border-border/70 bg-card/55 p-6">
                <h3 className="font-display text-xl font-semibold text-gold">{title}</h3>
                <ul className="mt-4 space-y-2">
                  {points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-transparent to-transparent p-10 text-center sm:p-14">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{t("landing.ctaTitle")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{t("landing.ctaBody")}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button variant="gold" size="lg" asChild>
              <Link to="/contact">{t("landing.contactUs")}</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/pricing">{t("landing.seePricing")}</Link>
            </Button>
            <Button variant="ghost" size="lg" asChild>
              <Link to="/auth">{t("common.studioLogin")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t border-gold/10 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center font-display text-3xl font-bold">{t("landing.faqTitle")}</h2>
          <dl className="mt-12 space-y-6">
            {faqs.map(({ q, a }) => (
              <div key={q} className="rounded-lg border border-border/70 bg-card/55 p-6">
                <dt className="font-medium">{q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default LandingPage;

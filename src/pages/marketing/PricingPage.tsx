import { Link } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle2, X } from "lucide-react";
import { BRANDING } from "@/lib/branding";
import { COMPARISON_ROWS, PRICING_FAQ, PRICING_PLANS } from "@/lib/pricingPlans";

const PricingPage = () => (
  <MarketingLayout>
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#d4af37]/80">Pricing</p>
        <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">Plans that scale with your studio</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Transparent monthly pricing. Every plan includes hosting, updates, and full documentation. No setup fees on
          Starter and Studio.
        </p>
      </div>

      <div className="mx-auto mt-14 grid max-w-6xl gap-8 lg:grid-cols-3">
        {PRICING_PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-2xl border p-8 ${
              plan.highlighted
                ? "border-[#d4af37]/50 bg-[#101216]/90 shadow-[0_0_40px_rgba(212,175,55,0.12)]"
                : "border-border/60 bg-card/30"
            }`}
          >
            {plan.highlighted ? (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#d4af37] px-3 py-0.5 text-xs font-semibold text-[#090a0f]">
                Most popular
              </span>
            ) : null}
            <p className="text-xs font-medium uppercase tracking-wider text-[#d4af37]/70">{plan.tagline}</p>
            <h2 className="mt-1 font-display text-2xl font-bold">{plan.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
            <p className="mt-6 font-display text-4xl font-bold text-gradient-gold">
              {plan.price}
              {plan.period ? <span className="text-base font-normal text-muted-foreground">{plan.period}</span> : null}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{plan.seats}</p>
            <ul className="mt-8 flex-1 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#d4af37]" />
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

      {/* Comparison table */}
      <div className="mx-auto mt-20 max-w-5xl">
        <h2 className="text-center font-display text-2xl font-bold sm:text-3xl">Compare plans</h2>
        <div className="mt-8 overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[540px] text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-card/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Feature</th>
                <th className="px-4 py-3 text-center font-medium">Starter</th>
                <th className="px-4 py-3 text-center font-medium text-[#d4af37]">Studio</th>
                <th className="px-4 py-3 text-center font-medium">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label} className="border-b border-border/40">
                  <td className="px-4 py-3 text-muted-foreground">{row.label}</td>
                  <td className="px-4 py-3 text-center">{row.starter === "—" ? <X className="mx-auto h-4 w-4 text-muted-foreground/50" /> : row.starter}</td>
                  <td className="px-4 py-3 text-center bg-[#d4af37]/5">{row.studio === "—" ? <X className="mx-auto h-4 w-4 text-muted-foreground/50" /> : row.studio}</td>
                  <td className="px-4 py-3 text-center">{row.enterprise === "—" ? <X className="mx-auto h-4 w-4 text-muted-foreground/50" /> : row.enterprise}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ */}
      <div className="mx-auto mt-20 max-w-3xl">
        <h2 className="text-center font-display text-2xl font-bold">Pricing FAQ</h2>
        <dl className="mt-10 space-y-4">
          {PRICING_FAQ.map(({ q, a }) => (
            <div key={q} className="rounded-lg border border-border/50 bg-card/30 p-5">
              <dt className="font-medium">{q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* CTA */}
      <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-[#d4af37]/25 bg-[#101216]/80 p-8 text-center">
        <h2 className="font-display text-xl font-bold">Not sure which plan fits?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Tell us about your studio and we&apos;ll recommend the right setup — or provision a trial instance for Studio.
        </p>
        <Button variant="gold" className="mt-6" asChild>
          <Link to="/contact">Contact us</Link>
        </Button>
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-muted-foreground">
        Prices in GBP, billed monthly. Stripe card fees apply separately to client payments. Questions?{" "}
        <a href={`mailto:${BRANDING.supportEmail}`} className="text-[#d4af37] hover:underline">
          {BRANDING.supportEmail}
        </a>
      </p>
    </section>
  </MarketingLayout>
);

export default PricingPage;

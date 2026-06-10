export type PricingPlan = {
  id: string;
  name: string;
  price: string;
  period: string;
  tagline: string;
  description: string;
  seats: string;
  maxArtistSeats: number;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted: boolean;
};

export const PLAN_PRICES_GBP = {
  starter: 14.95,
  studio: 19.95,
  enterprise: 29.9,
} as const;

export const PLAN_ARTIST_SEATS = {
  starter: 3,
  studio: 6,
  enterprise: 10,
} as const;

export const PLAN_ORDER = ["starter", "studio", "enterprise"] as const;

export function formatPlanPriceGbp(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

/** Same feature set on every plan — only artist seat count differs. */
export const SHARED_PLAN_FEATURES = [
  "Full schedule & multi-artist calendar",
  "Client CRM & CSV import",
  "Digital consent forms & customer portal",
  "Stripe deposits & invoice payments",
  "Staff inbox & role permissions",
  "Automated reminders & aftercare emails",
  "Stock management & billing records",
  "Documentation & email support",
] as const;

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: formatPlanPriceGbp(PLAN_PRICES_GBP.starter),
    period: "/ month",
    tagline: "Small team",
    description: "The full Velbok platform for shops with up to 3 artists.",
    seats: "Up to 3 artist seats",
    maxArtistSeats: PLAN_ARTIST_SEATS.starter,
    features: [...SHARED_PLAN_FEATURES],
    cta: "Start with Starter",
    ctaHref: "/subscribe?plan=starter",
    highlighted: false,
  },
  {
    id: "studio",
    name: "Studio",
    price: formatPlanPriceGbp(PLAN_PRICES_GBP.studio),
    period: "/ month",
    tagline: "Growing shop",
    description: "The full Velbok platform for shops with up to 6 artists.",
    seats: "Up to 6 artist seats",
    maxArtistSeats: PLAN_ARTIST_SEATS.studio,
    features: [...SHARED_PLAN_FEATURES],
    cta: "Start free trial",
    ctaHref: "/subscribe?plan=studio",
    highlighted: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: formatPlanPriceGbp(PLAN_PRICES_GBP.enterprise),
    period: "/ month",
    tagline: "Large studio",
    description: "The full Velbok platform for shops with up to 10 artists.",
    seats: "Up to 10 artist seats",
    maxArtistSeats: PLAN_ARTIST_SEATS.enterprise,
    features: [...SHARED_PLAN_FEATURES],
    cta: "Start with Enterprise",
    ctaHref: "/subscribe?plan=enterprise",
    highlighted: false,
  },
];

export const PRICING_FAQ = [
  {
    q: "Is there a free trial?",
    a: "All plans include a 14-day free trial. Choose a plan on the subscribe page — you'll enter card details on Stripe but won't be charged until the trial ends.",
  },
  {
    q: "What's included in every plan?",
    a: "Every plan includes the full Velbok platform — scheduling, CRM, deposits, consent, inbox, stock, billing, and more. The only difference is how many artists you can add.",
  },
  {
    q: "Are Stripe fees included?",
    a: "No. Card processing fees are charged by Stripe on top of your subscription. Velbok integrates with your Stripe account for deposits and invoices.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. Upgrade or downgrade anytime from Admin — Starter (3 artists), Studio (6), or Enterprise (10).",
  },
  {
    q: "Do you help migrate from my current system?",
    a: "All plans include client CSV import in the app. Contact us if you need hands-on migration help for bookings and records.",
  },
];

export const COMPARISON_ROWS: { label: string; starter: string; studio: string; enterprise: string }[] = [
  {
    label: "Monthly price (GBP)",
    starter: formatPlanPriceGbp(PLAN_PRICES_GBP.starter),
    studio: formatPlanPriceGbp(PLAN_PRICES_GBP.studio),
    enterprise: formatPlanPriceGbp(PLAN_PRICES_GBP.enterprise),
  },
  { label: "Artist seats", starter: "3", studio: "6", enterprise: "10" },
  { label: "Full platform features", starter: "✓", studio: "✓", enterprise: "✓" },
];

export function getPlanById(id: string | null): PricingPlan | undefined {
  if (!id) return undefined;
  return PRICING_PLANS.find((p) => p.id === id.toLowerCase());
}

export function comparePlanOrder(a: string, b: string): number {
  return PLAN_ORDER.indexOf(a as (typeof PLAN_ORDER)[number]) - PLAN_ORDER.indexOf(b as (typeof PLAN_ORDER)[number]);
}

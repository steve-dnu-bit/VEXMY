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
  enterprise: 49.95,
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

/** Core platform features included on every plan. */
export const CORE_PLAN_FEATURES = [
  "Full schedule & multi-artist calendar",
  "Client CRM & CSV import",
  "Digital consent forms & customer portal",
  "Stripe deposits & invoice payments",
  "Automated reminders & aftercare emails",
  "Stock management & billing records",
  "Documentation & email support",
] as const;

export const PLAN_INBOX_FEATURES: Record<(typeof PLAN_ORDER)[number], string[]> = {
  starter: [
    "Support tickets in the customer portal",
    "WhatsApp, SMS & email links from every booking",
    "Automated booking reminders & aftercare emails",
  ],
  studio: [
    "Support tickets in the customer portal",
    "WhatsApp, SMS & email links from every booking",
    "Automated booking reminders & aftercare emails",
  ],
  enterprise: [
    "Support tickets in the customer portal",
    "WhatsApp, SMS & email links from every booking",
    "Automated booking reminders & aftercare emails",
  ],
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: formatPlanPriceGbp(PLAN_PRICES_GBP.starter),
    period: "/ month",
    tagline: "Small team",
    description: "The full Velbok platform for shops with up to 3 artists. Support tickets and WhatsApp links included.",
    seats: "Up to 3 artist seats",
    maxArtistSeats: PLAN_ARTIST_SEATS.starter,
    features: [...CORE_PLAN_FEATURES, ...PLAN_INBOX_FEATURES.starter],
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
    description: "Full platform for shops with up to 6 artists. Support tickets and WhatsApp links included.",
    seats: "Up to 6 artist seats",
    maxArtistSeats: PLAN_ARTIST_SEATS.studio,
    features: [...CORE_PLAN_FEATURES, ...PLAN_INBOX_FEATURES.studio],
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
    description: "Full platform for shops with up to 10 artists. Support tickets and WhatsApp links included.",
    seats: "Up to 10 artist seats",
    maxArtistSeats: PLAN_ARTIST_SEATS.enterprise,
    features: [...CORE_PLAN_FEATURES, ...PLAN_INBOX_FEATURES.enterprise],
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
    a: "Every plan includes scheduling, CRM, deposits, consent, stock, billing, portal support tickets, and WhatsApp/SMS/email contact links from bookings.",
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
  { label: "Client contact centre", starter: "✓", studio: "✓", enterprise: "✓" },
  { label: "Unified inbox", starter: "—", studio: "Email + 1 channel", enterprise: "All channels" },
  { label: "API messages / month", starter: "—", studio: "300", enterprise: "500" },
];

export function getPlanById(id: string | null): PricingPlan | undefined {
  if (!id) return undefined;
  return PRICING_PLANS.find((p) => p.id === id.toLowerCase());
}

export function comparePlanOrder(a: string, b: string): number {
  return PLAN_ORDER.indexOf(a as (typeof PLAN_ORDER)[number]) - PLAN_ORDER.indexOf(b as (typeof PLAN_ORDER)[number]);
}

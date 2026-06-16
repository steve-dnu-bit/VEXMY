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

export type PlanPriceKey = keyof typeof PLAN_PRICES_GBP;

/** Monthly list prices by billing currency (aligned with subscription_plan_prices). */
export const PLAN_PRICES_BY_CURRENCY: Record<string, Record<PlanPriceKey, number>> = {
  gbp: { ...PLAN_PRICES_GBP },
  eur: { starter: 17.95, studio: 23.95, enterprise: 59.95 },
  usd: { starter: 18.95, studio: 24.95, enterprise: 62.95 },
  aud: { starter: 22.95, studio: 29.95, enterprise: 74.95 },
  cad: { starter: 20.95, studio: 27.95, enterprise: 69.95 },
  sek: { starter: 199, studio: 265, enterprise: 649 },
  nok: { starter: 199, studio: 265, enterprise: 649 },
  ron: { starter: 84.95, studio: 112.95, enterprise: 279.95 },
  bgn: { starter: 34.95, studio: 46.95, enterprise: 116.95 },
};

export function getPlanPricesForCurrency(currency: string | null | undefined): Record<PlanPriceKey, number> {
  const code = (currency || "gbp").toLowerCase();
  return PLAN_PRICES_BY_CURRENCY[code] ?? PLAN_PRICES_GBP;
}

export const PLAN_ARTIST_SEATS = {
  starter: 3,
  studio: 6,
  enterprise: 10,
} as const;

/** Max inbox/ticket image uploads per person per conversation, by plan. */
export const PLAN_TICKET_MEDIA_MAX = {
  starter: 2,
  studio: 6,
  enterprise: 10,
} as const;

export function getTicketMediaMaxForPlan(planId: string | null | undefined): number {
  if (!planId) return PLAN_TICKET_MEDIA_MAX.starter;
  const key = planId.toLowerCase() as keyof typeof PLAN_TICKET_MEDIA_MAX;
  return PLAN_TICKET_MEDIA_MAX[key] ?? PLAN_TICKET_MEDIA_MAX.starter;
}

/** Max AI stencil generations per user per rolling 24h window, by plan. */
export const PLAN_STENCIL_MAX_PER_24H = {
  starter: 3,
  studio: 6,
  enterprise: 10,
} as const;

export function getStencilMaxForPlan(planId: string | null | undefined): number {
  if (!planId) return PLAN_STENCIL_MAX_PER_24H.starter;
  const key = planId.toLowerCase() as keyof typeof PLAN_STENCIL_MAX_PER_24H;
  return PLAN_STENCIL_MAX_PER_24H[key] ?? PLAN_STENCIL_MAX_PER_24H.starter;
}

export const PLAN_ORDER = ["starter", "studio", "enterprise"] as const;

export function formatPlanPriceGbp(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

export function formatPlanPrice(amount: number, currency: string): string {
  const code = (currency || "gbp").toUpperCase();
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: code }).format(amount);
  } catch {
    return `${Number(amount).toFixed(2)} ${code}`;
  }
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
    a: "No. Card processing fees are charged by Stripe on top of your subscription. Typical UK Stripe rates are 1.5% + 20p for online UK cards and 1.4% + 10p for in-person Terminal EEA cards (higher for international cards). Stripe pricing can change, so confirm your live rates in Stripe.",
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

export type PricingPlan = {
  id: string;
  name: string;
  price: string;
  period: string;
  tagline: string;
  description: string;
  seats: string;
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

export function formatPlanPriceGbp(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: formatPlanPriceGbp(PLAN_PRICES_GBP.starter),
    period: "/ month",
    tagline: "Small team",
    description: "Run bookings professionally with up to 3 artists on your schedule.",
    seats: "Up to 3 artist seats",
    features: [
      "Multi-artist schedule (up to 3 seats)",
      "Client CRM & CSV import",
      "Digital consent forms",
      "Customer portal",
      "Booking reminders (when email configured)",
      "Documentation & email support",
    ],
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
    description: "The full Velbok toolkit for busy studios — up to 6 artists and front-desk staff.",
    seats: "Up to 6 artist seats",
    features: [
      "Everything in Starter",
      "Stripe deposits & invoice payments",
      "Staff inbox & role permissions",
      "Automated reminders & aftercare emails",
      "Stock management",
      "Billing & company records",
      "Priority email support",
    ],
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
    description: "For established shops with larger teams — up to 10 artists plus priority support.",
    seats: "Up to 10 artist seats",
    features: [
      "Everything in Studio",
      "Up to 10 artist seats",
      "Dedicated setup & migration help",
      "Custom branding & domain guidance",
      "SLA & priority support",
      "Training for your team",
    ],
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
    a: "Secure cloud hosting, product updates, access to documentation, SSL, and data stored on isolated Supabase infrastructure per studio.",
  },
  {
    q: "Are Stripe fees included?",
    a: "No. Card processing fees are charged by Stripe on top of your subscription. Velbok integrates with your Stripe account for deposits and invoices.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. Upgrade or downgrade as your team grows — Starter (3 artists), Studio (6), or Enterprise (10).",
  },
  {
    q: "Do you help migrate from my current system?",
    a: "Studio and Enterprise plans include client CSV import in the app. Enterprise includes hands-on migration assistance for bookings and records.",
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
  { label: "Schedule & CRM", starter: "✓", studio: "✓", enterprise: "✓" },
  { label: "Consent forms", starter: "✓", studio: "✓", enterprise: "✓" },
  { label: "Customer portal", starter: "✓", studio: "✓", enterprise: "✓" },
  { label: "Stripe deposits", starter: "—", studio: "✓", enterprise: "✓" },
  { label: "Invoicing", starter: "—", studio: "✓", enterprise: "✓" },
  { label: "Staff inbox", starter: "—", studio: "✓", enterprise: "✓" },
  { label: "Stock management", starter: "—", studio: "✓", enterprise: "✓" },
  { label: "Dedicated onboarding", starter: "—", studio: "—", enterprise: "✓" },
  { label: "SLA", starter: "—", studio: "—", enterprise: "✓" },
];

export function getPlanById(id: string | null): PricingPlan | undefined {
  if (!id) return undefined;
  return PRICING_PLANS.find((p) => p.id === id.toLowerCase());
}

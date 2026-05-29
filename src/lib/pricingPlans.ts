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

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "£49",
    period: "/ month",
    tagline: "Solo artist",
    description: "Everything you need to leave spreadsheets behind and run bookings professionally.",
    seats: "1 artist seat",
    features: [
      "Multi-artist schedule (1 seat)",
      "Client CRM & CSV import",
      "Digital consent forms",
      "Customer portal",
      "Booking reminders (when email configured)",
      "Documentation & email support",
    ],
    cta: "Start with Starter",
    ctaHref: "/contact?plan=starter",
    highlighted: false,
  },
  {
    id: "studio",
    name: "Studio",
    price: "£99",
    period: "/ month",
    tagline: "Growing shop",
    description: "The full VexMy toolkit for busy studios with multiple artists and front-desk staff.",
    seats: "Up to 5 artist seats",
    features: [
      "Everything in Starter",
      "Stripe deposits & invoice payments",
      "Staff inbox & role permissions",
      "Automated reminders & aftercare emails",
      "Stock management",
      "Billing & company records",
      "Priority email support",
    ],
    cta: "Book a demo",
    ctaHref: "/contact?plan=studio",
    highlighted: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    tagline: "Multi-location",
    description: "For studio groups, franchises, and shops that need hands-on onboarding.",
    seats: "Unlimited seats",
    features: [
      "Everything in Studio",
      "Dedicated setup & migration help",
      "Custom branding & domain guidance",
      "SLA & priority support",
      "Training for your team",
      "Volume pricing",
    ],
    cta: "Talk to sales",
    ctaHref: "/contact?plan=enterprise",
    highlighted: false,
  },
];

export const PRICING_FAQ = [
  {
    q: "Is there a free trial?",
    a: "Studio plans include a 14-day trial once your instance is provisioned. Contact us to get set up — we'll configure your studio and send login details.",
  },
  {
    q: "What's included in every plan?",
    a: "Secure cloud hosting, product updates, access to documentation, SSL, and data stored on isolated Supabase infrastructure per studio.",
  },
  {
    q: "Are Stripe fees included?",
    a: "No. Card processing fees are charged by Stripe on top of your subscription. VexMy integrates with your Stripe account for deposits and invoices.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. Upgrade or downgrade as your team grows. Enterprise customers can add locations and seats under a custom agreement.",
  },
  {
    q: "Do you help migrate from my current system?",
    a: "Studio and Enterprise plans include client CSV import in the app. Enterprise includes hands-on migration assistance for bookings and records.",
  },
];

export const COMPARISON_ROWS: { label: string; starter: string; studio: string; enterprise: string }[] = [
  { label: "Artist seats", starter: "1", studio: "Up to 5", enterprise: "Unlimited" },
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

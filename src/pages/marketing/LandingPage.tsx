import { Link } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  CreditCard,
  FileSignature,
  Inbox,
  LayoutDashboard,
  Package,
  Shield,
  Sparkles,
  Users,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { BRANDING } from "@/lib/branding";

const features = [
  {
    icon: Calendar,
    title: "Multi-artist schedule",
    description: "Day and week views, artist filters, booking types, and real-time updates across your whole team.",
  },
  {
    icon: Users,
    title: "Client CRM",
    description: "Import clients from CSV, track history, conduct notes, VIP flags, and linked customer accounts.",
  },
  {
    icon: CreditCard,
    title: "Deposits & Stripe",
    description: "Collect deposits at booking, send payment links, and reconcile paid status on the schedule.",
  },
  {
    icon: FileSignature,
    title: "Digital consent",
    description: "Tattoo and piercing consent forms with e-signatures, PDF export, and audit trail.",
  },
  {
    icon: Inbox,
    title: "Staff inbox",
    description: "Centralised messaging with clients — threads, media, and email notifications when configured.",
  },
  {
    icon: LayoutDashboard,
    title: "Billing & invoices",
    description: "Create invoices, line-item templates, Stripe checkout, and company-level billing records.",
  },
  {
    icon: Package,
    title: "Stock management",
    description: "Track supplies, supplier links, and stock requests from artists on the floor.",
  },
  {
    icon: Sparkles,
    title: "AI stencil tools",
    description: "Generate and refine stencils to speed up design prep (when enabled for your studio).",
  },
];

const steps = [
  {
    step: "01",
    title: "Subscribe & launch",
    body: "Get your VexMy studio instance configured with your branding, artists, and services.",
  },
  {
    step: "02",
    title: "Run your day",
    body: "Book clients on the schedule, take deposits, send consent links, and message from one dashboard.",
  },
  {
    step: "03",
    title: "Clients self-serve",
    body: "Customers view bookings, pay deposits, complete consent, and chat through their portal.",
  },
];

const audiences = [
  {
    title: "Studio owners",
    points: ["Full admin control", "Billing & permissions", "Multi-artist overview"],
  },
  {
    title: "Artists",
    points: ["Personal schedule", "Client notes & stencils", "Deposit tracking"],
  },
  {
    title: "Clients",
    points: ["Booking portal", "Secure payments", "Digital consent"],
  },
];

const faqs = [
  {
    q: "Is VexMy only for tattoo studios?",
    a: "VexMy is built for tattoo and piercing studios with consent workflows, multi-artist scheduling, and deposit handling — but any appointment-based creative studio can use the core platform.",
  },
  {
    q: "Do my clients need an account?",
    a: "Clients can receive links for deposits and consent without a full account. Optional customer accounts unlock the portal for bookings, messages, and invoices.",
  },
  {
    q: "Can I use my own branding?",
    a: "Yes. Each studio deployment supports custom shop name, colours, contact details, and portal theming.",
  },
  {
    q: "Where is my data stored?",
    a: "VexMy runs on Supabase (PostgreSQL) with row-level security. Each studio instance is isolated — your data stays yours.",
  },
];

const LandingPage = () => (
  <MarketingLayout>
    {/* Hero */}
    <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:pb-28">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[28vw] opacity-40 [background-image:url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20320%20900%27%3E%3Cpath%20d%3D%27M20%2040%20C130%2080%20150%20190%2085%20280%20C35%20350%2042%20430%20128%20500%27%20fill%3D%27none%27%20stroke%3D%27%23d4af37%27%20stroke-opacity%3D%270.25%27%20stroke-width%3D%272%27%2F%3E%3C%2Fsvg%3E')] bg-contain bg-left bg-no-repeat" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[28vw] opacity-40 [background-image:url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20320%20900%27%3E%3Cpath%20d%3D%27M300%2040%20C190%2080%20170%20190%20235%20280%20C285%20350%20278%20430%20192%20500%27%20fill%3D%27none%27%20stroke%3D%27%23d4af37%27%20stroke-opacity%3D%270.25%27%20stroke-width%3D%272%27%2F%3E%3C%2Fsvg%3E')] bg-contain bg-right bg-no-repeat" />

      <div className="relative mx-auto max-w-4xl text-center">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d4af37]/30 bg-[#d4af37]/5 px-4 py-1.5 text-xs tracking-wide text-[#d4af37]">
          <Shield className="h-3.5 w-3.5" />
          Built for modern tattoo studios
        </p>
        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          Run your studio
          <span className="block text-gradient-gold">without the chaos</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {BRANDING.platformName} is the all-in-one platform for scheduling, deposits, consent forms, billing, and
          client communication — so you spend less time on admin and more time tattooing.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button variant="gold" size="lg" asChild className="min-w-[200px]">
            <Link to="/contact">
              Get started
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="gold-outline" size="lg" asChild className="min-w-[200px]">
            <Link to="/pricing">View pricing</Link>
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Already have a studio?{" "}
          <Link to="/auth" className="text-[#d4af37] hover:underline">
            Sign in to your app
          </Link>
        </p>
      </div>

      {/* Preview card */}
      <div className="relative mx-auto mt-16 max-w-5xl px-2">
        <div className="rounded-2xl border border-[#d4af37]/25 bg-[#101216]/80 p-1 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-sm">
          <div className="rounded-xl border border-border/50 bg-[#0c0d12] p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between border-b border-border/40 pb-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#d4af37]/70">Studio dashboard</p>
                <p className="font-display text-lg font-semibold">Today&apos;s schedule</p>
              </div>
              <div className="flex gap-2">
                <span className="rounded-md bg-[#d4af37]/15 px-2 py-1 text-xs text-[#d4af37]">3 bookings</span>
                <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs text-emerald-400">2 deposits paid</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {["10:00 — Full sleeve consult", "13:30 — Portrait session", "16:00 — Touch-up"].map((slot) => (
                <div key={slot} className="rounded-lg border border-border/60 bg-card/50 p-4 text-sm">
                  <p className="text-muted-foreground">{slot.split(" — ")[0]}</p>
                  <p className="mt-1 font-medium">{slot.split(" — ")[1]}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Features */}
    <section id="features" className="border-t border-[#d4af37]/10 bg-[#0a0b10]/80 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Everything your studio needs</h2>
          <p className="mt-4 text-muted-foreground">
            One platform from first enquiry to healed tattoo — no patchwork of spreadsheets, DMs, and payment links.
          </p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group rounded-xl border border-border/60 bg-card/40 p-6 transition-colors hover:border-[#d4af37]/40 hover:bg-card/70"
            >
              <div className="mb-4 inline-flex rounded-lg bg-[#d4af37]/10 p-2.5 text-[#d4af37]">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* How it works */}
    <section className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">How it works</h2>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map(({ step, title, body }) => (
            <div key={step} className="relative rounded-xl border border-[#d4af37]/20 bg-[#101216]/60 p-8">
              <span className="font-display text-4xl font-bold text-[#d4af37]/25">{step}</span>
              <h3 className="mt-2 font-display text-xl font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Audiences */}
    <section className="border-t border-[#d4af37]/10 bg-[#0a0b10]/80 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-3xl font-bold">Built for everyone in the studio</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {audiences.map(({ title, points }) => (
            <div key={title} className="rounded-xl border border-border/60 bg-card/30 p-6">
              <h3 className="font-display text-xl font-semibold text-[#d4af37]">{title}</h3>
              <ul className="mt-4 space-y-2">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#d4af37]" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-4xl rounded-2xl border border-[#d4af37]/30 bg-gradient-to-br from-[#d4af37]/10 via-transparent to-transparent p-10 text-center sm:p-14">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">Ready to streamline your studio?</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Explore plans, read the docs, or sign in to your studio app to get started today.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button variant="gold" size="lg" asChild>
            <Link to="/contact">Contact us</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link to="/pricing">See pricing</Link>
          </Button>
          <Button variant="ghost" size="lg" asChild>
            <Link to="/auth">Studio login</Link>
          </Button>
        </div>
      </div>
    </section>

    {/* FAQ */}
    <section className="border-t border-[#d4af37]/10 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center font-display text-3xl font-bold">Questions</h2>
        <dl className="mt-12 space-y-6">
          {faqs.map(({ q, a }) => (
            <div key={q} className="rounded-lg border border-border/50 bg-card/30 p-6">
              <dt className="font-medium">{q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  </MarketingLayout>
);

export default LandingPage;

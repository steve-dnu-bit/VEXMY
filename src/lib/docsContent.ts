export type DocSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  note?: string;
};

export type DocPage = {
  slug: string;
  title: string;
  description: string;
  category: string;
  sections: DocSection[];
};

export const DOC_CATEGORIES = [
  { id: "start", label: "Getting started" },
  { id: "staff", label: "Staff app" },
  { id: "clients", label: "Clients & portal" },
  { id: "ops", label: "Operations" },
  { id: "admin", label: "Admin & setup" },
] as const;

export const DOC_PAGES: DocPage[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    description: "Overview of VexMy and how your studio uses the platform.",
    category: "start",
    sections: [
      {
        heading: "What is VexMy?",
        paragraphs: [
          "VexMy is a cloud-based studio management platform for tattoo and piercing shops. It combines scheduling, client records, deposits, consent forms, invoicing, messaging, and a customer portal in one application.",
          "Your team signs in at the studio app (/auth). Clients interact through optional customer accounts and secure links for deposits and consent.",
        ],
      },
      {
        heading: "Who uses what",
        bullets: [
          "Studio owners & admins — full access, billing, permissions, settings",
          "Artists — schedule, clients, stencils, deposits (based on permissions)",
          "Front desk / assistants — schedule and inbox (when granted)",
          "Customers — portal for bookings, payments, consent, and messages",
        ],
      },
      {
        heading: "First login",
        paragraphs: [
          "Use the email and password provided when your studio was onboarded. If you forgot your password, use Forgot password on the login page (requires email to be configured for your instance).",
          "After login, staff are routed to the schedule. Customers are routed to their account portal.",
        ],
      },
    ],
  },
  {
    slug: "schedule",
    title: "Schedule",
    description: "Book appointments, manage artists, and view day or week calendars.",
    category: "staff",
    sections: [
      {
        heading: "Views",
        bullets: [
          "Day view — hourly grid for selected artist(s)",
          "Week view — overview across the week",
          "Filter by artist using the sidebar checkboxes",
        ],
      },
      {
        heading: "Creating a booking",
        paragraphs: [
          "Click an empty slot or use the new booking control. Enter client name, contact details, service type, duration, and notes. Assign the responsible artist.",
          "Booking types include tattoo sessions, consultations, touch-ups, and piercings depending on your studio configuration.",
        ],
      },
      {
        heading: "Booking details",
        bullets: [
          "Mark deposit paid or send a deposit payment link",
          "Update status (confirmed, completed, cancelled, no-show)",
          "Link a customer account when the client has registered",
          "Open consent form flow for eligible tattoo/piercing bookings",
        ],
      },
      {
        heading: "Tips",
        note: "Artist colours and sidebar preferences are saved in your browser per device.",
      },
    ],
  },
  {
    slug: "clients",
    title: "Clients & CRM",
    description: "Import, search, and manage your client database.",
    category: "staff",
    sections: [
      {
        heading: "Client list",
        paragraphs: [
          "The Clients area shows everyone your studio has booked or imported. Search by name, email, or phone.",
        ],
      },
      {
        heading: "CSV import",
        bullets: [
          "Prepare a CSV with columns for name, email, phone, and notes",
          "Use Import on the Clients page and map columns",
          "Review duplicates before confirming",
        ],
      },
      {
        heading: "Conduct tracking",
        paragraphs: [
          "No-shows, late cancellations, and reschedules can be recorded. Admins may ban clients from online booking when needed.",
        ],
      },
    ],
  },
  {
    slug: "deposits",
    title: "Deposits & payments",
    description: "Collect deposits via Stripe and track payment status on bookings.",
    category: "ops",
    sections: [
      {
        heading: "Stripe setup",
        paragraphs: [
          "Your studio instance must have Stripe keys configured by an administrator. Once active, staff can generate checkout links from booking details or the Deposits area.",
        ],
      },
      {
        heading: "Deposit workflow",
        bullets: [
          "Create or open a booking on the schedule",
          "Generate a deposit link and send it to the client",
          "When paid, the booking shows deposit paid automatically (via webhook)",
          "VIP clients may be exempt from deposits if flagged on the booking",
        ],
      },
      {
        heading: "Customer payment page",
        paragraphs: [
          "Clients open secure checkout links without needing a staff login. Logged-in customers can also pay from their account portal under Deposits.",
        ],
      },
    ],
  },
  {
    slug: "billing",
    title: "Billing & invoices",
    description: "Create invoices, templates, and send payment requests.",
    category: "ops",
    sections: [
      {
        heading: "Invoices",
        bullets: [
          "Create invoices linked to clients and companies",
          "Add line items manually or from saved templates",
          "Send invoice emails with Stripe payment when configured",
          "Track status: draft, sent, paid, overdue",
        ],
      },
      {
        heading: "Companies",
        paragraphs: [
          "Studios with separate legal entities can assign bookings and invoices to the correct company record for accounting.",
        ],
      },
    ],
  },
  {
    slug: "consent",
    title: "Consent forms",
    description: "Digital tattoo and piercing consent with signatures and PDF export.",
    category: "clients",
    sections: [
      {
        heading: "When to use",
        paragraphs: [
          "Consent is required for eligible tattoo and piercing appointments. Staff or clients complete the form before the session.",
        ],
      },
      {
        heading: "Process",
        bullets: [
          "Open consent from a booking or send the client link",
          "Client reads health questions and studio policies",
          "Electronic signature captured with timestamp",
          "PDF stored for your records",
        ],
      },
      {
        heading: "Data storage",
        paragraphs: [
          "Consent records are retained for legal, medical, and insurance purposes as stated in your studio privacy policy.",
        ],
      },
    ],
  },
  {
    slug: "customer-portal",
    title: "Customer portal",
    description: "What clients see when they sign in to their account.",
    category: "clients",
    sections: [
      {
        heading: "Account features",
        bullets: [
          "Upcoming and past bookings",
          "Pay deposits and view invoice status",
          "Complete consent forms",
          "Message the studio (when inbox is enabled)",
          "Profile and security settings",
        ],
      },
      {
        heading: "Inviting customers",
        paragraphs: [
          "Admins invite customers from the Admin panel. Invited users receive an email to set a password and access the portal.",
        ],
      },
    ],
  },
  {
    slug: "inbox",
    title: "Inbox & messaging",
    description: "Staff–client chat threads with optional email notifications.",
    category: "staff",
    sections: [
      {
        heading: "Threads",
        paragraphs: [
          "Each conversation is tied to a client. Staff with inbox permission can reply, attach media, and see typing indicators when active.",
        ],
      },
      {
        heading: "Email notifications",
        note: "When SMTP is configured, clients can receive email alerts for new messages. Configure templates and sender details in your studio environment.",
      },
    ],
  },
  {
    slug: "stock",
    title: "Stock management",
    description: "Track supplies, suppliers, and artist stock requests.",
    category: "ops",
    sections: [
      {
        heading: "Stock items",
        bullets: [
          "Maintain a catalogue of supplies with quantities",
          "Link items to suppliers",
          "Artists submit stock requests for approval",
        ],
      },
    ],
  },
  {
    slug: "stencil",
    title: "Stencil tools",
    description: "AI-assisted stencil generation for artists.",
    category: "staff",
    sections: [
      {
        heading: "Using stencils",
        paragraphs: [
          "Artists with stencil permission can upload reference images and generate stencil variations. Outputs are saved to the artist's stencil library.",
        ],
        note: "Requires the generate-stencil edge function and API credentials configured for your studio.",
      },
    ],
  },
  {
    slug: "admin",
    title: "Admin & permissions",
    description: "Users, roles, and feature access for your studio team.",
    category: "admin",
    sections: [
      {
        heading: "Roles",
        bullets: [
          "Admin — full platform access including user management",
          "Artist — staff access scoped by permissions",
          "Customer — portal only",
        ],
      },
      {
        heading: "Permissions matrix",
        paragraphs: [
          "Admins grant per-feature access: schedule, inbox, billing, stock, admin, etc. Defaults apply when inviting artists or customers.",
        ],
      },
      {
        heading: "Inviting staff",
        bullets: [
          "Admin → Invite user → choose artist or customer",
          "Set email and display name",
          "Invitee completes signup and profile setup",
        ],
      },
    ],
  },
  {
    slug: "settings",
    title: "Settings & profile",
    description: "Artist profiles, portal theme, security, and MFA.",
    category: "admin",
    sections: [
      {
        heading: "Artist profile",
        bullets: [
          "Display name and public bio for customer portal branding",
          "Portal background colour and image",
          "Public contact links (Instagram, email, phone)",
        ],
      },
      {
        heading: "Security",
        bullets: [
          "Change password from Settings",
          "Enable two-factor authentication (TOTP)",
          "Manage active sessions",
        ],
      },
    ],
  },
  {
    slug: "setup",
    title: "Studio setup guide",
    description: "Technical checklist for launching a new VexMy studio instance.",
    category: "admin",
    sections: [
      {
        heading: "Environment",
        bullets: [
          "Supabase project with migrations applied",
          "VITE_SUPABASE_URL and anon key in hosting (Netlify/Vercel)",
          "Edge functions deployed with secrets (Stripe, SMTP, CRON)",
          "SITE_URL set to your studio domain for email links",
        ],
      },
      {
        heading: "Branding",
        bullets: [
          "VITE_SHOP_NAME, support email, and accent colour",
          "shop_settings row in database for legal/consent text",
          "Custom domain and SSL on your host",
        ],
      },
      {
        heading: "Go-live",
        paragraphs: [
          "See docs/vexmy-go-live-checklist.md in the repository for auth URLs, admin user setup, and production verification steps.",
        ],
      },
    ],
  },
];

export function getDocBySlug(slug: string): DocPage | undefined {
  return DOC_PAGES.find((p) => p.slug === slug);
}

export function getDocsByCategory(categoryId: string): DocPage[] {
  return DOC_PAGES.filter((p) => p.category === categoryId);
}

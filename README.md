# Velbok

Velbok is a subscription-ready tattoo studio management platform. It provides scheduling, client CRM, deposits, consent forms, invoicing, customer portal, messaging, stock management, and automated email workflows.

Built with React, Vite, TypeScript, Tailwind, and Supabase.

## Features

- Multi-artist schedule with day/week views
- Client import (CSV) and CRM
- Stripe deposit and invoice payments
- Digital consent forms with PDF generation
- Automated booking reminders and aftercare emails
- Customer portal (bookings, deposits, messages, consent)
- Staff inbox, billing, stock, AI stencil tools, admin panel

## Quick start

### 1. Create a Supabase project

Create a new project at [supabase.com](https://supabase.com). Note your project ref, URL, and anon key.

### 2. Configure environment

```bash
cp .env.example .env
```

Set `VITE_SUPABASE_*` and shop branding variables in `.env`.

Set edge function secrets in Supabase (Dashboard → Edge Functions → Secrets):

| Secret | Purpose |
|--------|---------|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Email (edge functions + see [docs/email-setup.md](docs/email-setup.md)) |
| `SITE_URL` | App URL for links in emails |
| `CRON_SECRET` | Secures scheduled reminder/aftercare jobs |
| `SHOP_NAME`, `SHOP_LEGAL_NAME`, `SHOP_TRADING_NAME` | Shop branding in emails/PDFs |
| `SHOP_SUPPORT_EMAIL`, `SHOP_WEBSITE_URL`, `SHOP_ADDRESS` | Contact details |
| `RESEND_API_KEY` | Optional consent email delivery |

### 3. Link Supabase and run migrations

Update `supabase/config.toml` with your project ref, then:

```bash
npm install
npm run db:link
npm run db:push
```

After linking, update cron job URLs in your Supabase SQL editor if migrating from another project (see `supabase/SECURITY_CRON_SETUP.md`).

### 4. Deploy edge functions

```bash
npx supabase functions deploy --project-ref your-project-ref
```

### 5. Run locally

```bash
npm run dev
```

App runs at http://localhost:8080

## Per-shop configuration

Each deployment can customize branding via environment variables (frontend `VITE_*` and edge function secrets). The `shop_settings` table stores shop details in the database for future multi-tenant expansion.

## Documentation

- **Product docs (web):** `/docs` on your deployed site — source in `src/lib/docsContent.ts`
- **User guide index:** [docs/user-guide/README.md](docs/user-guide/README.md)
- **Go-live checklist:** [docs/Velbok-go-live-checklist.md](docs/Velbok-go-live-checklist.md)

## Marketing site

Public routes on velbok.com:

| Route | Purpose |
|-------|---------|
| `/` | Product landing page |
| `/pricing` | Subscription plans |
| `/docs` | Product documentation |
| `/contact` | Contact & sales form |
| `/auth` | Studio app login |

## Production (velbok.com / Netlify)

See **[docs/Velbok-go-live-checklist.md](docs/Velbok-go-live-checklist.md)** for login, Supabase redirect URLs, Netlify env vars, and edge function secrets.

**Branch + manual preview (save build credits):** **[docs/deploy-workflow.md](docs/deploy-workflow.md)** — push a feature branch, `npm run deploy:preview`, then `npm run deploy:prod` when ready.

## Platform roadmap

Current architecture is single-tenant per Supabase project. Multi-tenant SaaS (subdomain routing, organization-scoped RLS, Stripe Connect per shop) is the next phase — the `shop_settings` table and env-driven branding are the foundation.

## License

Private — all rights reserved.

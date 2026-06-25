# Velbok — Vapi AI Agent Knowledge Base

**Purpose:** Give callers and chat users exact, accurate information about Velbok services, pricing, setup, and documentation.  
**Official website:** https://velbok.com  
**Documentation:** https://velbok.com/docs  
**Support email:** support@velbok.com  
**Last synced from product source:** June 2026

---

## Agent behavior guidelines

- Velbok is **B2B software for tattoo and piercing studios**. A paid subscription and studio account are required.
- Do **not** invent prices, features, or limits. Use only the figures in this document.
- For tax, VAT, or accounting questions (especially POS split payments), say Velbok is payment-routing software only — recommend a qualified accountant.
- Stripe card processing fees are **separate** from the Velbok subscription.
- If unsure or the question needs human follow-up, direct users to **support@velbok.com** or https://velbok.com/contact
- Studio staff sign in at https://velbok.com/auth (or their studio’s custom domain if provisioned).

---

## What is Velbok?

Velbok is a cloud-based, all-in-one studio management platform for **tattoo and piercing shops**. It combines:

- Multi-artist scheduling (day/week views)
- Client CRM with CSV import
- Stripe deposits and invoice payments
- Digital tattoo and piercing consent forms (e-signatures, PDF export)
- Customer portal (bookings, payments, consent, support tickets)
- Billing and invoicing
- Stock management
- Client contact centre (WhatsApp, SMS, email links from bookings)
- Support tickets / enquiry messaging in the customer portal
- AI stencil generation tools
- In-person POS checkout with Stripe Tap to Pay (mobile app)
- Optional POS split payments between studio and artists (Stripe Connect)

**Tagline:** Run your studio without the chaos — spend less time on admin and more time tattooing.

**Data:** Runs on Supabase (PostgreSQL) with row-level security. Each studio instance is isolated.

**Payments:** Velbok uses Stripe Connect so client card payments for deposits and invoices route to the studio’s Stripe account. Platform billing for the Velbok subscription is separate.

---

## Who uses Velbok?

| Role | Access |
|------|--------|
| Studio owners & admins | Full access — billing, permissions, settings, user management |
| Artists | Schedule, clients, stencils, deposits (based on permissions) |
| Front desk / assistants | Schedule and inbox (when granted) |
| Customers | Portal for bookings, payments, consent, messages, support tickets |

After login, **staff** go to the schedule. **Customers** go to their account portal.

---

## Pricing plans (monthly subscription)

All plans include the **full core platform**: scheduling, CRM, deposits, consent, stock, billing, portal support tickets, and WhatsApp/SMS/email contact links from bookings.

### Plan summary (GBP — default)

| Plan | Monthly price | Artist seats | 14-day free trial | Best for |
|------|---------------|--------------|-------------------|----------|
| **Solo** | £9.95/month | 1 | Yes | Solo artist |
| **Starter** | £14.95/month | Up to 3 | Yes | Small team |
| **Studio** | £19.95/month | Up to 6 | Yes (most popular) | Growing shop |
| **Enterprise** | £49.95/month | Up to 10 | **No** — billed immediately | Large studio |

Subscribe at: https://velbok.com/subscribe?plan={solo|starter|studio|enterprise}  
Pricing page: https://velbok.com/pricing

### Plan limits (per plan)

| Plan | Ticket images per person (per conversation) | AI stencils per rolling 24h |
|------|-----------------------------------------------|-----------------------------|
| Solo | 2 | 2 |
| Starter | 2 | 3 |
| Studio | 6 | 6 |
| Enterprise | 10 | 10 |

**Support tickets / inbox channels:**
- Solo & Starter: Support tickets in customer portal; WhatsApp & contact links from every booking
- Studio: Email + 1 additional inbox channel
- Enterprise: All inbox channels

### Prices in other currencies (monthly)

| Plan | EUR | USD | AUD | CAD | SEK | NOK | RON | BGN |
|------|-----|-----|-----|-----|-----|-----|-----|-----|
| Solo | €11.95 | $12.95 | A$15.95 | C$13.95 | 129 kr | 129 kr | 56.95 lei | 23.95 лв |
| Starter | €17.95 | $18.95 | A$22.95 | C$20.95 | 199 kr | 199 kr | 84.95 lei | 34.95 лв |
| Studio | €23.95 | $24.95 | A$29.95 | C$27.95 | 265 kr | 265 kr | 112.95 lei | 46.95 лв |
| Enterprise | €59.95 | $62.95 | A$74.95 | C$69.95 | 649 kr | 649 kr | 279.95 lei | 116.95 лв |

Currency is selected based on studio country during subscription.

### Supported countries (13)

United Kingdom, United States, Canada, Australia, Germany, France, Romania, Italy, Spain, Sweden, Norway, Netherlands, Bulgaria — with local currency and language support.

### Pricing FAQ (exact answers)

**Is there a free trial?**  
Solo, Starter, and Studio include a **14-day free trial**. You enter card details on Stripe but are not charged until the trial ends. **Enterprise is billed immediately** when you subscribe — no free trial.

**What's included in every plan?**  
Scheduling, CRM, deposits, consent, stock, billing, portal support tickets, and WhatsApp/SMS/email contact links from bookings.

**Are Stripe fees included?**  
**No.** Card processing fees are charged by Stripe on top of your subscription. Typical UK Stripe rates:
- Online UK cards: **1.5% + 20p**
- In-person Stripe Terminal (EEA cards): **1.4% + 10p**  
International cards may be higher. Confirm live rates in your Stripe Dashboard.

**Can I switch plans later?**  
Yes. Upgrade or downgrade anytime from **Admin** — Solo (1 artist), Starter (3), Studio (6), Enterprise (10).

**Do you help migrate from my current system?**  
All plans include **client CSV import** in the app. Contact Velbok for hands-on migration help for bookings and records.

---

## How to get started (new studio)

### Self-serve subscription flow

1. Visit https://velbok.com/pricing and choose a plan (or https://velbok.com/contact for a demo/walkthrough).
2. Go to https://velbok.com/subscribe?plan=studio (or solo/starter/enterprise).
3. Create an account (email/password or Google sign-in where enabled) and enter your **studio name**.
4. Accept platform Terms and Privacy.
5. Complete **Stripe Checkout** for the subscription (card required; trial plans are not charged for 14 days).
6. Velbok provisions your studio instance with branding; invite artists from **Admin → Invite user**.

### Contact / demo path

- Contact form: https://velbok.com/contact — typically responds within **1 business day**.
- Popular request: most studios start with the **Studio** plan and request a walkthrough with branding and first artists provisioned.

### First login (existing studio)

- Sign in at https://velbok.com/auth
- Use the email and password from onboarding. Use **Forgot password** if needed (requires email configured for the instance).
- Staff land on the **schedule**; customers land on the **customer portal**.

---

## Core features — setup & usage

### Schedule
**Doc:** https://velbok.com/docs/schedule

- **Day view** — hourly grid for selected artist(s)
- **Week view** — overview across the week
- Filter by artist using sidebar checkboxes
- Create bookings: click empty slot or new booking control — client name, contact, service type, duration, notes, assigned artist
- Booking types: tattoo sessions, consultations, touch-ups, piercings (per studio configuration)
- From booking details: mark deposit paid, send deposit link, update status (confirmed/completed/cancelled/no-show), link customer account, open consent flow

### Clients & CRM
**Doc:** https://velbok.com/docs/clients

- Search clients by name, email, or phone
- **CSV import:** columns for name, email, phone, notes → Import on Clients page → map columns → review duplicates
- Record no-shows, late cancellations, reschedules; admins can ban clients from online booking

### Deposits & payments
**Doc:** https://velbok.com/docs/deposits

**Stripe setup:** Admin must configure Stripe keys. Then staff generate checkout links from booking details or Deposits area.

**Workflow:**
1. Create or open a booking on the schedule
2. Generate a deposit link and send to the client
3. When paid, booking shows deposit paid automatically (webhook)
4. VIP clients may be exempt if flagged on the booking

Clients open secure checkout links without staff login. Logged-in customers can pay from portal under Deposits.

### Billing & invoices
**Doc:** https://velbok.com/docs/billing

- Create invoices linked to clients and companies
- Line items manually or from templates
- Send invoice emails with Stripe payment when configured
- Status: draft, sent, paid, overdue
- Multiple legal entities: assign bookings/invoices to company records

### Digital consent
**Doc:** https://velbok.com/docs/consent

- Required for eligible tattoo and piercing appointments
- Open from booking or send client link
- Health questions, studio policies, electronic signature with timestamp
- PDF stored for records (legal, medical, insurance per studio privacy policy)

### Customer portal
**Doc:** https://velbok.com/docs/customer-portal

**Client features:** upcoming/past bookings, pay deposits, view invoices, complete consent, message studio (when inbox enabled), profile and security.

**Inviting customers:** Admin → invite customer → email to set password.

Clients can use deposit/consent links **without** a full account. Optional accounts unlock full portal.

### Inbox & messaging
**Doc:** https://velbok.com/docs/inbox

- Threads tied to each client
- Staff with inbox permission: reply, attach media, typing indicators
- Email notifications for new messages when SMTP is configured

### Stock management
**Doc:** https://velbok.com/docs/stock

- Catalogue of supplies with quantities
- Link items to suppliers
- Artists submit stock requests for approval

### AI stencil tools
**Doc:** https://velbok.com/docs/stencil

- Upload reference images; generate stencil variations in styles named after cities:
  - **Paris** — signature line
  - **London** — traditional
  - **Tokyo** — fine line
  - **Rome** — sketch
  - **Berlin** — dotwork
  - **Madrid** — blackwork
- **AI generation limits** (per user, rolling 24h): Solo 2, Starter 3, Studio 6, Enterprise 10. Failed renders do not count.
- Generated stencils kept **24 hours** in Recent stencils, then auto-deleted
- **Basic in-browser engine:** free and unmetered

### Admin & permissions
**Doc:** https://velbok.com/docs/admin

**Roles:** Admin (full), Artist (scoped by permissions), Customer (portal only)

Admins grant per-feature access: schedule, inbox, billing, stock, admin, etc.

**Invite staff:** Admin → Invite user → artist or customer → email and display name → invitee completes signup.

### Settings & profile
**Doc:** https://velbok.com/docs/settings

- Artist profile: display name, bio, portal background colour/image, public contact links (Instagram, email, phone)
- Security: change password, TOTP two-factor authentication, manage sessions

---

## POS checkout & Tap to Pay
**Doc:** https://velbok.com/docs/pos-checkout  
**Download app:** https://velbok.com/download

Velbok supports **Stripe Tap to Pay** — staff phone becomes the payment terminal. No separate card reader required for this mode.

**Customer payment types:** contactless cards, Google Pay, Apple Pay, Samsung Pay and other NFC wallets (Visa, Mastercard, Amex, Discover — region-dependent).

### Stripe setup (no hardware purchase)

1. Finish **Stripe Connect** for studio (Admin → POS checkout)
2. Create **Terminal location** in Velbok (Admin → POS → Create Terminal location)
3. Enable POS checkout for staff
4. Install **release** Velbok app on compatible phone (not debug build) from https://velbok.com/download
5. No separate “enable Tap to Pay” switch in Stripe — only Connect + Terminal location
6. Register reader serial in Stripe Dashboard only if using physical device (e.g. WisePad 3)

**In app:** Checkout → Tap to Pay (this phone) → Enable phone payments → Charge.

### Supported Android phones (Tap to Pay)

Requirements: NFC, Android 13+, Google Play Services, hardware keystore with ECDH, **Developer options OFF** for live payments.

**Works (examples):** Pixel 6+, Galaxy S22+, Z Flip4+, many recent Galaxy A/M/F, Motorola edge 2022+, OnePlus 10+, Xiaomi 12+, and more. Full Stripe list: https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=android#device-types

**Does NOT work:** Galaxy S21/S20/S10 and older, phones without NFC or ECDH, rooted phones/emulators, Android 12 or older, debug installs, Developer options ON.

### iPhone (Tap to Pay on iPhone)

- iPhone XS or later, iOS 16.4+
- Velbok iOS app with Apple Tap to Pay entitlement
- Same Stripe Connect + Terminal location setup

Apple details: https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=ios

### Optional hardware

**WisePad** (Bluetooth), **WisePOS E**, **Stripe Reader S700** (Wi‑Fi). Register WisePad serial in Stripe Dashboard → Terminal → Readers.

### Troubleshooting

- Install latest release APK from https://velbok.com/download; uninstall old Velbok first if needed
- Tap **Test Stripe server link** on Checkout before Enable
- Allow **Location** permission (required by Stripe Terminal on Android)
- Turn Developer options OFF and restart if Stripe reports insecure environment
- Galaxy S21: use WisePad or S22+ / Z Flip7+ for Tap to Pay

### Mobile app download

- **Google Play** (internal testing): account must be on tester list
- **Direct APK:** https://velbok.com/downloads/velbok-android.apk
- **iPhone:** TestFlight or App Store when available — not from download page

---

## POS split payments (studio ↔ artist)
**Doc:** https://velbok.com/docs/pos-split-payments

When an artist is assigned on a POS charge, Velbok collects the full amount on the **studio’s** Stripe Connect account, keeps the shop share, and **transfers the artist’s share** to the artist’s Connect account.

### Requirements

Both **studio** and **each artist** need fully onboarded **separate** Stripe Connect accounts via Velbok. Accounts from other platforms will not work.

### Studio setup

1. Admin → POS checkout
2. Complete Stripe Connect (identity, business, bank)
3. Create Terminal location
4. Set default shop split % (e.g. 50/50) and enable POS checkout
5. Optional per-artist overrides

Studio Connect account is **merchant of record** — client’s card statement shows the studio.

### Artist setup

1. Artist signs in with their Velbok user account
2. Settings → POS payout account
3. Connect payout account → complete Stripe Express onboarding
4. Card shows Connected when payouts enabled

### At checkout

1. Staff selects artist on POS charge
2. Client pays full amount (e.g. £200) via Tap to Pay or reader
3. Stripe settles to studio account minus fees
4. Velbok transfers artist share (e.g. £100 at 50/50)
5. Shop share remains in studio account
6. If transfer fails, sale is still paid — fix Connect and retry from Admin → POS

**Tax disclaimer:** Velbok only routes money between Connect accounts. It does not provide tax/VAT/accounting advice. Full client payment is typically studio turnover; artist income is usually their commission/split. Confirm with a qualified adviser.

---

## Technical studio setup (for admins / implementers)
**Doc:** https://velbok.com/docs/setup

### Environment

- Supabase project with migrations applied
- `VITE_SUPABASE_URL` and anon key on hosting (Netlify/Vercel)
- Edge functions deployed with secrets (Stripe, SMTP, CRON)
- `SITE_URL` set to studio domain for email links

### Branding

- `VITE_SHOP_NAME`, support email, accent colour
- `shop_settings` row in database for legal/consent text
- Custom domain and SSL on host

Each deployment supports custom shop name, colours, contact details, and portal theming.

---

## Landing page FAQ

**Is Velbok only for tattoo studios?**  
Built for tattoo and piercing studios with consent, multi-artist scheduling, and deposits — but any appointment-based creative studio can use the core platform.

**Do clients need an account?**  
They can use deposit and consent links without an account. Optional accounts unlock portal for bookings, tickets, and invoices.

**Can I use my own branding?**  
Yes — custom shop name, colours, contact details, portal theming per studio deployment.

**Where is data stored?**  
Supabase (PostgreSQL) with row-level security; each studio instance isolated.

---

## Important URLs

| Page | URL |
|------|-----|
| Home | https://velbok.com |
| Pricing | https://velbok.com/pricing |
| Subscribe | https://velbok.com/subscribe |
| Contact | https://velbok.com/contact |
| Documentation index | https://velbok.com/docs |
| Getting started | https://velbok.com/docs/getting-started |
| Download mobile app | https://velbok.com/download |
| Studio login | https://velbok.com/auth |
| Privacy | https://velbok.com/privacy |
| Terms | https://velbok.com/terms |
| Cookies | https://velbok.com/cookies |

---

## Contact & support

- **Email:** support@velbok.com
- **Contact form:** https://velbok.com/contact (response within 1 business day)
- **System email (no-reply):** no-reply@velbok.com (password resets, automated reminders — not for general support)

---

## Suggested Vapi system prompt (copy-paste)

```
You are the Velbok support assistant. Velbok is an all-in-one cloud platform for tattoo and piercing studios: scheduling, CRM, Stripe deposits, digital consent, billing, stock, customer portal, support tickets, AI stencils, and mobile POS (Tap to Pay).

Rules:
- Only state prices and limits from your knowledge base. GBP default: Solo £9.95, Starter £14.95, Studio £19.95, Enterprise £49.95 per month.
- Solo/Starter/Studio have a 14-day free trial; Enterprise bills immediately with no trial.
- Stripe processing fees are NOT included in subscription.
- For setup: new studios subscribe at velbok.com/subscribe or contact velbok.com/contact. Staff login at velbok.com/auth. Docs at velbok.com/docs.
- For tax/accounting on POS splits, say Velbok routes payments only — refer to an accountant.
- If you cannot answer confidently, offer support@velbok.com or the contact form.

Be concise, friendly, and practical. Tattoo studio owners are often busy — give clear next steps.
```

---

## Vapi upload notes

1. Upload this entire file as a **Knowledge Base** document in the Vapi dashboard, or split into sections if your plan has size limits.
2. Set the **system prompt** above in the assistant configuration.
3. Optionally add **function tools** for: opening contact form URL, pricing page, subscribe deep links (`/subscribe?plan=studio`), and docs paths.
4. Re-sync this file when pricing or docs change in `src/lib/pricingPlans.ts` and `src/i18n/locales/docs/en.json`.

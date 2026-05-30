# Email setup for VexMy

VexMy uses email in **two places**. You must configure both for a complete setup.

| System | What it sends | Where to configure |
|--------|----------------|-------------------|
| **Supabase Auth** | Sign-up confirm, **password reset**, magic links | Supabase Dashboard → **Authentication** → **SMTP Settings** |
| **Edge functions** | **Bookings**, invites, reminders, aftercare, invoices, deposits, chat | Supabase **Edge Function secrets** (`RESEND_API_KEY`, `EMAIL_FROM`, …) |

**Password reset working but booking emails not?** Auth SMTP and Edge secrets are **separate**. You must set Edge Function secrets even if Auth SMTP is already configured. Run `.\scripts\setup-email-now.ps1` with the same Resend `re_...` key.

Consent PDF emails can optionally use **Resend API** (`RESEND_API_KEY`) in addition to SMTP.

---

## Recommendation: Resend (best fit for VexMy)

**Why Resend over raw Gmail/Hotmail SMTP:**

- Works with your existing code (nodemailer + SMTP — no code changes)
- Good deliverability when you verify **vexmy.com**
- Free tier: 3,000 emails/month, 100/day
- Same provider can power Supabase Auth SMTP
- Optional `RESEND_API_KEY` for consent emails already supported in code

**Alternatives:**

| Provider | Good if… | Notes |
|----------|----------|--------|
| **Brevo** (Sendinblue) | You want a generous free SMTP relay | 300 emails/day free; SMTP relay in dashboard |
| **Postmark** | High deliverability, paid transactional | Excellent for production shops |
| **Microsoft 365 / Google Workspace** | You already pay for `you@vexmy.com` mailbox | OK for low volume; not ideal for bulk reminders |
| **Hotmail personal SMTP** | Quick test only | Often blocked, rate-limited, poor “from” branding |

Avoid sending production mail from `@hotmail.com` — use **`no-reply@vexmy.com`** on your verified domain.

---

## Step 1 — Resend account & domain

1. Sign up at [resend.com](https://resend.com).
2. **Domains** → Add **`vexmy.com`**.
3. Add the DNS records Resend shows (SPF + DKIM; add DMARC when ready):
   - Usually a TXT record for SPF
   - CNAME records for DKIM
4. Wait until the domain shows **Verified**.
5. Create an **API Key** (Production).

**Resend SMTP credentials** (used by nodemailer in edge functions):

| Secret | Value |
|--------|--------|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `465` (SSL) or `587` (STARTTLS) |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | Your Resend API key (`re_…`) |
| `EMAIL_FROM` | `VexMy <no-reply@vexmy.com>` |

Use a verified address on your domain for `EMAIL_FROM`.

---

## Step 2 — Supabase Edge Function secrets

From the project folder, after `npx supabase login` and `npm run db:link`:

```powershell
cd inkaholics-29cc97fa-main
.\scripts\set-email-secrets.ps1
```

Or set manually:

```powershell
npx supabase secrets set `
  SMTP_HOST=smtp.resend.com `
  SMTP_PORT=465 `
  SMTP_USER=resend `
  SMTP_PASS=re_YOUR_API_KEY `
  EMAIL_FROM="VexMy <no-reply@vexmy.com>" `
  SITE_URL=https://vexmy.com `
  SHOP_SUPPORT_EMAIL=no-reply@vexmy.com `
  SHOP_NAME="VexMy" `
  SHOP_WEBSITE_URL=https://vexmy.com
```

Optional consent via Resend HTTP API:

```powershell
npx supabase secrets set RESEND_API_KEY=re_YOUR_API_KEY
```

Secrets apply to all deployed edge functions automatically (no redeploy required for secret-only changes, but redeploy if unsure).

---

## Step 3 — Supabase Auth SMTP (password reset & signup)

This fixes **Forgot password** on vexmy.com.

1. Supabase Dashboard → project **vexmy** (`tkremoxfkgoiuwghtzwd`)
2. **Authentication** → **SMTP Settings** → **Enable Custom SMTP**
3. Enter:

| Field | Resend value |
|-------|----------------|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API key |
| Sender email | `no-reply@vexmy.com` |
| Sender name | `VexMy` |

4. **Authentication** → **URL Configuration** (if not done):
   - Site URL: `https://vexmy.com`
   - Redirect URLs: `https://vexmy.com/**`

5. **Authentication** → **Email Templates** — paste HTML that matches the VexMy dark/gold style (see `docs/supabase-auth-email-templates.html`).

6. Send a **test email** from SMTP settings if available, or trigger forgot-password on `/auth`.

---

## Unified transactional templates (edge functions)

All studio emails share one layout in `supabase/functions/_shared/email.ts` and `email-templates.ts`:

| Email | Includes `.ics` calendar file |
|-------|-------------------------------|
| Booking confirmed / updated / cancelled | Yes |
| Appointment reminder | Yes |
| Deposit reminder | Yes |
| Deposit request (Stripe checkout link) | No |
| Deposit receipt | Yes |
| Invoice (PDF attached) | No |
| Chat update | No |
| Tattoo / piercing aftercare | No |
| Artist / customer invite | No |

Booking `.ics` files work with Apple Calendar, Google Calendar, and Outlook. Customers can open the attachment to add or update the appointment.

After changing template code, redeploy affected edge functions:

```powershell
cd inkaholics-29cc97fa-main
npx supabase functions deploy booking-notifications send-booking-reminders create-stripe-checkout stripe-webhook send-chat-update-email send-invoice send-aftercare-emails invite-user --project-ref tkremoxfkgoiuwghtzwd
```

---

## Step 4 — Verify it works

### Auth (login / reset)

1. Open https://vexmy.com/auth → **Forgot your password?**
2. Use your admin email → check inbox (and spam).
3. Link should go to `https://vexmy.com/auth?mode=recovery`.

### Edge functions (studio emails)

After SMTP secrets are set:

- **Admin** → invite a test user (invite email)
- Create a booking with your email → trigger reminder (or wait for cron)
- Send a test invoice if billing is configured

Check Supabase → **Edge Functions** → **Logs** if mail fails.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No auth emails | Enable Custom SMTP in Supabase Auth; verify domain in Resend |
| “SMTP is not configured” in logs | Run `set-email-secrets.ps1` or `supabase secrets set` |
| Mail goes to spam | Complete DKIM + SPF; use `@vexmy.com` From address; avoid Hotmail From |
| Reset link wrong host | Set `SITE_URL=https://vexmy.com` secret + Auth URL config |
| Emails from wrong brand | Set `SHOP_NAME`, `SHOP_SUPPORT_EMAIL`, `EMAIL_FROM` secrets |

---

## Per-studio deployments (future)

Each tenant studio can use its own `EMAIL_FROM` and `SHOP_*` secrets on their Supabase project. Platform mail (`no-reply@vexmy.com`) stays on the main VexMy marketing/auth instance.

---

## Quick reference — all email-related secrets

```
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS          (or SMTP_PASSWORD)
EMAIL_FROM         (or SMTP_FROM)
SITE_URL
RESEND_API_KEY     (optional, consent)
SHOP_NAME
SHOP_SUPPORT_EMAIL
SHOP_WEBSITE_URL
```

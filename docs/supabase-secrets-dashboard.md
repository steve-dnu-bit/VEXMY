# Supabase secrets — paste in Dashboard (Option C)

Project: **Velbok** (`tkremoxfkgoiuwghtzwd`)

**Where:** [Supabase Dashboard](https://supabase.com/dashboard/project/tkremoxfkgoiuwghtzwd/settings/functions) → **Edge Functions** → **Secrets**  
(or **Project Settings** → **Edge Functions** → **Secrets**)

Add or update each row. You only need to paste your **Resend API key** yourself (`re_...`).

---

## Edge function secrets

| Secret name | Value |
|-------------|--------|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | *Your Resend API key* (`re_...`) |
| `EMAIL_FROM` | `Velbok <no-reply@velbok.com>` |
| `SITE_URL` | `https://velbok.com` |
| `SHOP_SUPPORT_EMAIL` | `support@velbok.com` |
| `SHOP_NAME` | `Velbok` |
| `SHOP_WEBSITE_URL` | `https://velbok.com` |
| `RESEND_API_KEY` | *Same Resend API key* (`re_...`) — **required** for booking emails |
| `BOOKINGS_EMAIL_FROM` | `Velbok <no-reply@velbok.com>` (must be on verified domain) |
| `NOTIFICATIONS_EMAIL_FROM` | `Velbok <no-reply@velbok.com>` |
| `CRON_SECRET` | *Random 32+ char string* — must match database vault secret `cron_secret` (see below) |
| `RESEND_WEBHOOK_SECRET` | `whsec_...` from Resend → Webhooks (inbound `email.received` on `resend-inbound`) |
| `RESEND_INBOUND_DOMAIN` | `velbok.com` (receiving domain — use root on free Resend plan; Pro can use `email.velbok.com`) |
| `BOOKINGS_REPLY_TO` | `bookings@velbok.com` (reply-to on booking emails when inbound is on root domain) |
| `RESEND_INBOUND_FORWARD_TO` | Optional — forward inbound mail to this inbox (defaults to `SHOP_SUPPORT_EMAIL`) |

Click **Save** after each secret (or bulk add if your dashboard supports it).

**Or run:** `.\scripts\setup-booking-email.ps1` (sets all of the above + prints vault SQL).

### Cron chain (reminders + aftercare every 15 minutes)

Run `.\scripts\setup-cron-chain.ps1` — sets `CRON_SECRET`, vault `cron_secret`, and schedules:

- `send-booking-reminders-every-15-min`
- `send-aftercare-emails-every-15-min`

Re-schedule after changing the secret:

```sql
SELECT * FROM public.refresh_cron_jobs();
```

### CRON_SECRET + database vault (booking emails on save)

New bookings call `booking-notifications` from a **database trigger**. That needs:

1. Edge secret **`CRON_SECRET`**
2. Vault secret **`cron_secret`** with the **same value**

In **SQL Editor**, if you already set `CRON_SECRET` in the dashboard:

```sql
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'cron_secret' LIMIT 1),
  'PASTE_SAME_VALUE_AS_CRON_SECRET_EDGE_SECRET'
);
```

---

## Platform subscription billing (Stripe)

Required for `/subscribe` checkout. **All three** price secrets must be set.

| Secret | Value |
|--------|--------|
| `STRIPE_SECRET_KEY` | `sk_test_...` (dev) or `sk_live_...` (production) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from Stripe webhook endpoint |
| `STRIPE_PRICE_STARTER` | `price_...` recurring monthly price (**not** `prod_...`) |
| `STRIPE_PRICE_STUDIO` | `price_...` |
| `STRIPE_PRICE_ENTERPRISE` | `price_...` |

**How to get price IDs:** Stripe Dashboard → **Products** → open plan → **Pricing** → copy **Price ID** (`price_...`). Create a **recurring** monthly price if none exists.

**Test vs live:** If `STRIPE_SECRET_KEY` is `sk_test_...`, all `STRIPE_PRICE_*` must be from **Test mode** in Stripe (toggle top-right).

**Validate (admin):** After deploy, signed-in admin can POST to edge function `validate-platform-billing` (empty body) to see which secrets fail.

---

## Auth SMTP (password reset — separate page)

**Where:** **Authentication** → **SMTP Settings** → **Enable Custom SMTP**

| Field | Value |
|--------|--------|
| Host | `smtp.resend.com` |
| Port number | `465` |
| Username | `resend` |
| Password | *Your Resend API key* (`re_...`) |
| Sender email | `no-reply@velbok.com` |
| Sender name | `Velbok` |

---

## Auth URLs (confirm while you’re there)

**Authentication** → **URL Configuration**

| Setting | Value |
|---------|--------|
| Site URL | `https://velbok.com` |
| Redirect URLs | `https://velbok.com/**` |

---

## Test

1. https://velbok.com/auth → **Forgot your password?**
2. Check inbox for mail **from** `no-reply@velbok.com`

---

## Note on reply-to

System mail (reset, reminders) sends **from** `no-reply@velbok.com`. Customer-facing contact and reply-to use `SHOP_SUPPORT_EMAIL` (`support@velbok.com`).

# Email setup from scratch (Velbok)

One script configures everything. **~5 minutes.**

## Prerequisites

1. [Resend](https://resend.com) account  
2. **velbok.com** added and **Verified** in Resend → Domains  
3. Resend **API key** (`re_...`) from Resend → API Keys  

## Run

```powershell
cd inkaholics-29cc97fa-main
.\scripts\setup-all-email-from-scratch.ps1
```

Follow every step. **Do not skip Step 4** (vault SQL) or Step 6 test.

## What gets configured

| System | Purpose | Where |
|--------|---------|--------|
| Edge secrets | Booking confirmations, reminders, invoices | Functions → Secrets |
| Vault `cron_secret` | DB trigger + pg_cron auth | SQL Editor |
| Auth SMTP | Forgot password | Authentication → SMTP |
| pg_cron | Reminders every 15 min | `refresh_cron_jobs()` |

## Required Edge secrets (reference)

All use sender **`Velbok <no-reply@velbok.com>`** on verified domain:

- `RESEND_API_KEY` = `re_...`
- `SMTP_PASS` = same `re_...`
- `SMTP_HOST` = `smtp.resend.com`
- `SMTP_PORT` = `465`
- `SMTP_USER` = `resend`
- `EMAIL_FROM`, `BOOKINGS_EMAIL_FROM`, `NOTIFICATIONS_EMAIL_FROM`
- `SITE_URL` = `https://velbok.com`
- `CRON_SECRET` = random string (script generates; must match vault)

## If test fails

```powershell
.\scripts\test-edge-email.ps1
```

Read the error:

- **401** — wrong `CRON_SECRET` or vault not updated  
- **503** — missing `RESEND_API_KEY` in Edge secrets  
- **500 Resend API 422/403** — domain not verified or wrong `From` address  

## Verify booking emails

```sql
SELECT recipient_email, action, status, error_message, sent_at
FROM public.booking_notification_events
ORDER BY sent_at DESC
LIMIT 10;
```

Booking needs a **client email** and artist **booking confirmation** enabled in Settings.

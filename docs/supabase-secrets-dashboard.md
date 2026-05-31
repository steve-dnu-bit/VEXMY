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
| `SHOP_SUPPORT_EMAIL` | `no-reply@velbok.com` |
| `SHOP_NAME` | `Velbok` |
| `SHOP_WEBSITE_URL` | `https://velbok.com` |
| `RESEND_API_KEY` | *Same Resend API key* (`re_...`) — optional, for consent emails |

Click **Save** after each secret (or bulk add if your dashboard supports it).

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

`no-reply@` is fine for system mail (reset, reminders). If you want customers to reply to a real inbox later, change `SHOP_SUPPORT_EMAIL` to e.g. `hello@velbok.com` — emails can still send **from** `no-reply@velbok.com`.

# SMS & Twilio setup (per studio)

Velbok does **not** provide a shared SMS number for all organizations. Each studio connects **its own** [Twilio](https://www.twilio.com) account and phone number. That number is used for:

- **Inbound SMS** in the unified inbox (Enterprise / plans with inbox)
- **Outbound replies** from the inbox
- **Appointment & deposit reminders** when Admin → Emails → notification channel is **SMS** or **Email & SMS**

Email reminders use Velbok’s platform email. **SMS always uses your Twilio account.**

---

## What you need

1. A [Twilio account](https://www.twilio.com/try-twilio)
2. A Twilio **phone number** with SMS enabled  
   - UK studios: if +44 is not available, **Ireland (+353)** is a common choice  
   - Do **not** use the same number for Vapi voice AI and Velbok inbox unless you disable Vapi SMS on that line (one webhook per number)
3. Twilio **Account SID**, **Auth Token**, and your **phone number** (E.164 format, e.g. `+353851234567`)

---

## Step 1 — Connect Twilio in Velbok

1. Log in as **admin** or **owner**
2. Open **Inbox** (`/inbox`)
3. In the **SMS (Twilio)** card, click **Connect Twilio**
4. Enter:
   - **Account SID** — from Twilio Console dashboard
   - **Auth Token** — from Twilio Console (keep secret)
   - **Phone Number** — exactly as Twilio shows it, with `+` and country code
5. Click **Connect**

Credentials are stored per **organization** in `channel_connections` (not shared with other studios).

---

## Step 2 — Configure Twilio webhook (inbound texts)

1. Twilio Console → **Phone Numbers** → **Manage** → your number
2. Under **Messaging** → **A message comes in**:
   - **Webhook:** `https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1/sms-webhook`
   - **HTTP POST**
3. Save

Optional Supabase secret (helps signature validation):

- Name: `TWILIO_SMS_WEBHOOK_URL`  
- Value: `https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1/sms-webhook` (no trailing slash)

---

## Step 3 — Enable SMS reminders (optional)

1. **Admin** → **Emails & reminders**
2. Under **Notification channel**, choose **SMS only** or **Email & SMS**
3. Enable **Appointment reminders** and/or **Deposit reminders** as needed
4. **Save settings**

Reminders are sent to the **client phone** on each booking. Email is not required for SMS-only mode.

---

## Step 4 — Test

### Inbound (client → studio)

1. From your mobile, text your Twilio number: `Velbok test`
2. Velbok → **Inbox** → **Unified inbox** → refresh — message should appear (plans with inbox)
3. Twilio → **Monitor** → **Messaging** — webhook should show **200**

### Outbound (studio → client)

1. Reply from the inbox thread, or send from Twilio Console → **Try SMS**
2. Client should receive the text from your Twilio number

### Reminders

1. Create a test booking with a **future date**, **client phone**, and reminder timing due soon (or wait for cron)
2. Check Twilio messaging logs for outbound reminder

---

## Troubleshooting

| Problem | What to check |
|--------|----------------|
| Webhook won’t save in Twilio | Number may be locked by **Vapi** — use a **second** number for Velbok |
| Twilio webhook **401** | Auth Token in Velbok must match Twilio; set `TWILIO_SMS_WEBHOOK_URL` secret |
| `no_matching_org` in logs | Phone number in Velbok must match Twilio **To** number (`+353...` format) |
| No message in Inbox | SMS connected? Plan includes inbox? Send inbound test again |
| Reminders not sent via SMS | Admin channel = SMS/both; booking has client phone; Twilio connected |
| US Vapi number | Vapi inbound SMS is US-only; Velbok SMS works with any Twilio SMS-capable number |

---

## Plans & billing

- **SMS reminders** are available on **all Velbok plans** that include reminders, once Twilio is connected.
- **Unified inbox** (threaded SMS/WhatsApp in the app) depends on your subscription inbox features.
- **Twilio charges** (per message, number rental) are billed by **Twilio directly**, not Velbok.

---

## Security

- Never commit Auth Tokens to git or share them in support tickets.
- Each studio should use its own Twilio account (or subaccount) for clear billing and compliance.
- Rotate the Auth Token in Twilio if it is exposed, then update Velbok **Connect Twilio**.

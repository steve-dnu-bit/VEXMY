# Google Play release checklist (Velbok)

Operator: **Inkaholics Limited** (UK) · Website: **https://velbok.com** · Package: **com.velbok.app**

## Before each release

1. Set production `.env` / Netlify `VITE_*` vars (Supabase, branding).
2. Bump `versionCode` and `versionName` in `android/app/build.gradle`.
3. Ensure `android/keystore.properties` and release keystore exist (never commit).
4. Build AAB: `npm run android:bundle`
5. Output: `android/app/build/outputs/bundle/release/app-release.aab`
6. Release builds include native debug symbols (`ndk.debugSymbolLevel`) in the AAB for Play crash reports — no separate upload needed.

## Play Console setup

| Item | Value |
|------|--------|
| App name | Velbok |
| Package | `com.velbok.app` |
| Privacy policy | https://velbok.com/privacy |
| Target audience | **Not designed for children under 13** (see below) |
| Financial features | Yes (Stripe payments, POS) |

## Data safety (declare honestly)

- Name, email, phone, address, user IDs
- **Health info** (consent form medical questions)
- Financial info (invoices/deposits; cards via Stripe)
- Photos (avatars, chat, signatures)
- **Precise location** (Android — Stripe Terminal / Tap to Pay)
- App activity (bookings, cookie consent audit)

Shared with: **Stripe**, **Supabase**, **Resend**, **Twilio** (optional per studio).

## Target audience (Play Console)

Velbok is **booking and studio-management software**, not a tattoo parlour. See the main doc section on age bands — do **not** lock the entire app to 18+ only.

## Terms acceptance at subscribe

Studios must tick the Terms / Privacy checkbox before Stripe checkout. Acceptance is recorded in `platform_terms_acceptances` (version `2026-07-16`). Bump `PLATFORM_TERMS_VERSION` in `src/lib/legalVersions.ts` and `supabase/functions/_shared/legal-versions.ts` when Terms change.

## Edge function secrets (production)

- `META_APP_SECRET` — Meta webhook signature verification
- `TWILIO_AUTH_TOKEN` + `TWILIO_WEBHOOK_URL` — WhatsApp webhook verification
- Stripe, SMTP, `SITE_URL=https://velbok.com`

Deploy after code changes:

```powershell
supabase functions deploy validate-stripe-connect stripe-terminal-pos meta-webhook whatsapp-webhook submit-consent --project-ref tkremoxfkgoiuwghtzwd
npm run db:push
```

## Testing track

Use **Internal testing** first (required for Tap to Pay validation). Add tester Google accounts and install via Play link — not sideloaded debug APKs.

## Android permissions disclosure

The app shows an in-app dialog before requesting location/Bluetooth (Stripe payments). Play listing text should match.

## Netlify production env

Set at minimum:

```
VITE_SHOP_LEGAL_NAME=Inkaholics Limited
VITE_SHOP_PRIVACY_EMAIL=privacy@velbok.com
VITE_SHOP_WEBSITE_URL=https://velbok.com
```

Redeploy after changing env vars.

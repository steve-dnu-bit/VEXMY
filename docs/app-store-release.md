# App Store release checklist (Velbok iOS)

Operator: **Inkaholics Limited** (UK) · Website: **https://velbok.com** · Bundle ID: **com.velbok.app**

The iOS app is a **Capacitor shell** around the same React web app used on Android and velbok.com. Native code is limited to Stripe Terminal (Tap to Pay + WisePad) and Apple’s required Tap to Pay education overlay.

## Use the correct branch

All iOS / Xcode work happens on **`apple-app-store`**, not `play-store-launch` or `main`.

```bash
git fetch origin
git checkout apple-app-store
git pull
```

In Xcode you do **not** switch branches inside the IDE for day-to-day work — switch in Terminal first, then reopen the project.

## First time on a Mac (fix black screen)

A **black screen** almost always means the web app was not copied into the iOS project.

1. Clone and checkout `apple-app-store` (see above).
2. Copy env: `cp .env.example .env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (only needed when **rebuilding** the web bundle).
3. Install and import the web app into iOS:
   ```bash
   npm install
   npm run ios:prepare
   ```
4. Open Xcode: `npm run cap:ios`
5. Select your **Apple Developer Team** under Signing & Capabilities.
6. Run on a **physical iPhone** (Tap to Pay does not work in Simulator).

This branch **commits** `ios/App/App/public/` so a fresh clone can open in Xcode immediately. After you change the React app, run `npm run ios:prepare` again and commit the updated `public/` folder.

## Before each release

1. Set production `.env` / Netlify `VITE_*` vars (Supabase, branding).
2. Bump `scripts/mobile-version.json` (`versionName` + `versionCode`).
3. Sync versions to native projects: `npm run sync:version`
4. Prepare the iOS bundle: `npm run ios:prepare` (icons, mobile web build, `cap sync`)
5. On a **Mac with Xcode 15+**, open the project: `npm run cap:ios`
6. In Xcode → **Signing & Capabilities**: select your Apple Developer team and confirm bundle ID `com.velbok.app`. Add **Tap to Pay on iPhone** capability only after Apple approves it for your App ID.
7. Archive: Product → **Archive** → **Distribute App** → App Store Connect  
   Or from the repo root on macOS: `npm run ios:archive`

Output IPA (when using the script): `releases/app-versions/ios/export/App.ipa`

## App Store Connect setup

| Item | Value |
|------|--------|
| App name | Velbok |
| Bundle ID | `com.velbok.app` |
| Primary category | Business |
| Privacy policy | https://velbok.com/privacy |
| Support URL | https://velbok.com/contact |
| Marketing URL | https://velbok.com |
| Age rating | **Not designed for children under 13** (business software) |
| Financial features | Yes (Stripe in-person payments, studio invoicing) |

## App Privacy (nutrition labels)

Declare honestly — mirror the Android data safety form in Play Console:

- **Contact info:** name, email, phone, address
- **Health:** consent form medical questions (optional per booking)
- **Financial info:** invoices/deposits; card data handled by Stripe
- **Photos:** avatars, chat attachments, consent signatures
- **Location:** precise location when using Stripe Terminal / Tap to Pay (reader discovery)
- **Identifiers:** user ID, device ID (session)
- **Usage data:** bookings, cookie consent audit (web only; native hides cookie banner)

**Data linked to the user:** yes (account, bookings, payments).  
**Tracking:** no.  
**Third parties:** Stripe, Supabase, Resend, Twilio (per studio, optional).

## Account deletion (Guideline 5.1.1)

In-app account deletion **request** is available (same as Android):

- Staff: **Settings** → Account deletion request card
- Customers: **Account → Security**

Flow opens a pre-filled email to `privacy@velbok.com`. Document this in App Review notes.

## Subscriptions (Guideline 3.1.1)

Velbok is **B2B studio management SaaS**. Platform subscriptions are billed via **Stripe Checkout / Customer Portal** (web), not App Store IAP. The native app:

- Hides marketing/pricing pages
- Redirects `/subscribe` → `/billing` (shop invoicing)
- Manages platform subscription from **Admin → Subscription** (Stripe portal)

Include in **App Review notes**:

> Velbok is a business tool for tattoo studio staff. Subscriptions are purchased outside the app via Stripe for the studio’s Velbok platform plan. In-app payments are Stripe Connect charges between studios and their clients (physical services), not digital goods.

## Tap to Pay on iPhone

Requirements (see also `docs/pos-tap-to-pay.md`):

- Apple must approve **Tap to Pay on iPhone** on your App ID
- Physical iPhone (XS or later), iOS 16.4+
- Stripe Terminal live mode in production builds
- “How to Tap” education via `TapToPayEducationPlugin` (iOS 18+)

Test on **TestFlight** with a real device before submitting for Tap to Pay review.

Internal testers list: `releases/app-versions/ios/testflight-internal-testers.csv`

## Permissions (Info.plist)

| Key | Purpose |
|-----|---------|
| `NSBluetoothAlwaysUsageDescription` | WisePad card reader |
| `NSBluetoothPeripheralUsageDescription` | WisePad card reader |
| `NSLocationWhenInUseUsageDescription` | Stripe Bluetooth reader discovery |

## Encryption export

`ITSAppUsesNonExemptEncryption` is set to **false** (HTTPS/TLS only). Confirm during upload if prompted.

## Edge function secrets (production)

Same as Android — see `docs/google-play-release.md`. Deploy after backend changes:

```powershell
supabase functions deploy validate-stripe-connect stripe-terminal-pos meta-webhook whatsapp-webhook submit-consent --project-ref tkremoxfkgoiuwghtzwd
npm run db:push
```

## Version source of truth

Edit `scripts/mobile-version.json`, then run `npm run sync:version` to update:

- `ios/App/App.xcodeproj` (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`)
- `android/app/build.gradle` (`versionName`, `versionCode`)
- `public/downloads/android-version.json` and `public/downloads/ios-version.json`

## Screenshots

Capture on iPhone 6.7" and 6.5" (required sizes in App Store Connect). Show: schedule, POS checkout, client list, settings. Use production or staging data without real client PII.

## Netlify production env

```
VITE_SHOP_LEGAL_NAME=Inkaholics Limited
VITE_SHOP_PRIVACY_EMAIL=privacy@velbok.com
VITE_SHOP_WEBSITE_URL=https://velbok.com
```

Redeploy after changing env vars — the mobile app loads the bundled web assets from the last `cap:sync`, not live Netlify, unless you change the build pipeline.

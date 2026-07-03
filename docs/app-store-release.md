# App Store release checklist (Velbok iOS)

Operator: **Inkaholics Limited** · Bundle ID: **com.velbok.app** · Website: **https://velbok.com**

iOS builds **must run on a Mac** (Xcode). You can prepare the web bundle on Windows with `npm run ios:prepare`, then archive on your cloud Mac.

---

## One-time Apple Developer setup

1. [Apple Developer](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles**
2. **Identifiers** → App ID `com.velbok.app` with:
   - Push Notifications
   - **Proximity Reader Payment Acceptance** (Tap to Pay on iPhone — Stripe)
3. Note your **Team ID** (Membership page, 10 characters) — needed for builds.
4. **App Store Connect** → create app **Velbok** with bundle `com.velbok.app`.

### Firebase (push notifications)

1. Firebase Console → iOS app `com.velbok.app`
2. Download `GoogleService-Info.plist` → place at `ios/App/App/GoogleService-Info.plist`
3. Upload APNs `.p8` key to Firebase (see `docs/mobile-push-setup.md`)
4. Set `FIREBASE_SERVICE_ACCOUNT_JSON` in Supabase secrets

---

## Before each release

1. Bump in `ios/App/App.xcodeproj` (or Xcode → Target → General):
   - **Version** (`MARKETING_VERSION`) — e.g. `1.0.40`
   - **Build** (`CURRENT_PROJECT_VERSION`) — must increase every upload, e.g. `41`
2. Align with Android when possible (`android/app/build.gradle`).
3. On **any machine**: `npm run ios:prepare` (syncs latest web app into `ios/`).
4. On **Mac**: archive and upload (script or Xcode).

---

## Option A — Automated script (cloud Mac)

```bash
git clone <your-repo> && cd VEXMY
export APPLE_TEAM_ID=YOUR10CHARTEAMID
chmod +x scripts/ios-archive.sh
./scripts/ios-archive.sh
```

Archive-only (no upload):

```bash
SKIP_UPLOAD=1 ./scripts/ios-archive.sh
```

Sign in to Xcode first: **Xcode → Settings → Accounts** → add Apple ID.

---

## Option B — Xcode GUI (recommended first time)

1. `npm ci && npm run cap:sync`
2. `open ios/App/App.xcodeproj`
3. Select **App** target → **Signing & Capabilities**
   - Team: your Inkaholics / developer team
   - Bundle ID: `com.velbok.app`
   - Capabilities: Push Notifications, **Proximity Reader Payment Acceptance** (should match `App.entitlements`)
4. **Product → Archive**
5. Organizer → **Distribute App** → **App Store Connect** → upload
6. Leave **Upload your app's symbols** enabled (dSYM for crash reports)

---

## App Store Connect after upload

| Item | Value |
|------|--------|
| Privacy policy | https://velbok.com/privacy |
| Category | Business / Productivity |
| Age rating | Complete questionnaire (booking app, not child-directed) |
| Export compliance | `ITSAppUsesNonExemptEncryption` is `false` in Info.plist (HTTPS only) |

### TestFlight first

Use **Internal testing** before public release. Tap to Pay requires a **physical iPhone** (not Simulator).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No signing certificate | Xcode → Settings → Accounts → Manage Certificates → Apple Distribution |
| Provisioning profile errors | Enable Automatic signing; `-allowProvisioningUpdates` in script |
| Tap to Pay entitlement missing | Apple must approve Proximity Reader capability on your account |
| Push not working | `GoogleService-Info.plist`, APNs key in Firebase, Push capability in Xcode |
| Camera / photo crash | Info.plist usage strings (already in repo) |

---

## Outputs

| Artifact | Path |
|----------|------|
| Archive | `ios/build/Velbok.xcarchive` |
| IPA copy | `releases/app-versions/ios/velbok-*-build*.ipa` |

Play Store Android builds remain separate: `npm run android:bundle` on Windows.

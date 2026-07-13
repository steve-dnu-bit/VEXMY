# Mobile push notifications (Android & iOS)

Velbok native app push uses **Firebase Cloud Messaging (FCM)** for both Google Play and the App Store.

## iOS — what’s already wired in the repo

These are done in code / Xcode project (no manual SwiftUI Firebase snippet needed):

- `AppDelegate.swift` — `FirebaseApp.configure()` + APNs→FCM token bridge for Capacitor
- `App.xcodeproj` — SPM packages `FirebaseCore` + `FirebaseMessaging`
- `App.entitlements` — `aps-environment: production`
- `Info.plist` — `remote-notification` background mode
- JS — `PushNotificationHandler` + `register-push-token` edge function

Check anytime:

```bash
npm run verify:ios-push
```

Install the Firebase plist after you download it:

```bash
node scripts/install-ios-google-services.mjs "C:\path\to\GoogleService-Info.plist"
```

### Still requires your Apple / Firebase / Supabase login

1. Put real `GoogleService-Info.plist` at `ios/App/App/` (gitignored)
2. Apple Developer → APNs Auth Key (`.p8`) for the team
3. Firebase Console → Cloud Messaging → upload that `.p8` (Key ID + Team ID)
4. Supabase secret `FIREBASE_SERVICE_ACCOUNT_JSON` (same Firebase project as Android: `comvelbookapp`)
5. Rebuild a **TestFlight / Release** build on a **physical iPhone** and allow notifications

Push is sent for:

| Audience | Events |
|----------|--------|
| **Staff (artist)** | New / updated / cancelled bookings assigned to them |
| **Customer** | Booking confirmations & changes (portal account linked) |
| **Customer** | Appointment & deposit reminders (when reminders run) |
| **Staff & customer** | New support ticket / inbox messages (push is immediate; email is debounced ~2 min) |

Email and SMS continue to work as before. Push is **additional** when the user has installed the app and allowed notifications.

---

## 1. Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/) → **Add project** (or use existing).
2. Add **Android app**:
   - Package name: `com.velbok.app`
   - Download `google-services.json` → place at `android/app/google-services.json`
3. Add **iOS app**:
   - Bundle ID: `com.velbok.app`
   - Download `GoogleService-Info.plist` → add to Xcode project `ios/App/App/`
4. **Project settings → Cloud Messaging**:
   - Note the **Sender ID** (for reference)

### Apple Push (required for iOS)

1. [Apple Developer](https://developer.apple.com/) → **Certificates, Identifiers & Profiles**
2. App ID `com.velbok.app` → enable **Push Notifications**
3. **Keys** → create **APNs Auth Key** (.p8)
4. Firebase → Project settings → **Cloud Messaging** → **Apple app configuration** → upload APNs key

### Service account (server sending)

1. Firebase → Project settings → **Service accounts**
2. **Generate new private key** (JSON)
3. In Supabase → **Edge Functions → Secrets**, add:

```
FIREBASE_SERVICE_ACCOUNT_JSON=<paste entire JSON file on one line>
```

---

## 2. Build & release

```bash
npm install
npm run cap:sync
```

- **Android**: open Android Studio → build signed AAB → upload to Play Console
- **iOS**: open Xcode → enable **Push Notifications** capability on target → archive → App Store Connect

Users must install the **new store build** and tap **Allow** when prompted for notifications.

---

## 3. How tokens are stored

After login on the native app, the device registers with FCM and saves the token in Supabase `device_push_tokens` (per user).

No push is sent until:

1. Firebase secret is set on Supabase
2. User grants notification permission
3. User is logged in (staff or customer)

---

## 4. Testing

1. Install debug/release build on a **physical device** (iOS Simulator push is limited).
2. Log in as staff or customer → allow notifications.
3. Create or update a booking → artist phone should get a push.
4. Customer with portal account linked (`client_user_id`) gets customer pushes.

Check Edge Function logs: `register-push-token`, `booking-notifications`, `ticket-push-notify`.

4. Send an inbox message (customer ↔ artist) → recipient phone should get a push within seconds.

---

## 5. Troubleshooting

| Issue | Fix |
|-------|-----|
| No permission prompt | Reinstall app; ensure `@capacitor/push-notifications` synced (`npm run cap:sync`) |
| Android: registration fails | Add `android/app/google-services.json` and rebuild |
| iOS: no push | APNs key in Firebase; Push capability in Xcode; use physical device |
| Push never arrives | Set `FIREBASE_SERVICE_ACCOUNT_JSON` in Supabase secrets |
| Token registered but no push | Check `device_push_tokens` table for `is_active = true` |

---

## Privacy

Users control notifications via OS settings. Velbok does not send marketing push — only booking, reminder, and message alerts tied to their account.

# Velbok Android build archive

Exported builds found on this machine, renamed with version numbers.

## Latest — 1.0.41 (build 42)

**Google Play:** upload `aab/velbok-1.0.41-build42.aab` (~51 MB)

**Side-load APK:** `apk/velbok-1.0.41-build42.apk` (~50 MB)

### Changes
- Billing quantity fields can be cleared and retyped without typing first
- Checkout Charge requires a client name
- Fixed black square text cursor when editing fields in the Android app
- Transparent logo assets across the app UI
- Includes latest web app (billing, checkout, branding)

## Previous — 1.0.40 (build 41)

## Install APK (side-load)

```powershell
adb install -r "apk\velbok-1.0.41-build42.apk"
```

## Play Store bundle (AAB)

Upload `aab/velbok-1.0.41-build42.aab` to Google Play Console — not installable directly on a phone.

## Google Play release notes (paste)

```
• Billing: quantity fields can be cleared and retyped without typing first
• Checkout: Charge is disabled until a client name is entered
• Fixed black square text cursor when editing fields in the Android app
• Transparent logo assets across the app UI
• Bug fixes and stability improvements
```

See `versions.json` for the full manifest.

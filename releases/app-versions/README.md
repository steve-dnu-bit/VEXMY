# Velbok Android build archive

Exported builds found on this machine, renamed with version numbers.

## Latest — 1.0.42 (build 43)

**Google Play:** upload `aab/velbok-1.0.42-build43.aab` (~51 MB)

**Side-load APK:** `apk/velbok-1.0.42-build43.apk` (~50 MB)

### Changes
- Fixed light/opaque square behind the text cursor when typing in the app
- Checkout Charge stays tappable and shows a toast if items, artist, or client are missing
- Billing quantity clear/retype fix
- Transparent logo assets

## Previous — 1.0.41 (build 42)

## Install APK (side-load)

```powershell
adb install -r "apk\velbok-1.0.42-build43.apk"
```

## Play Store bundle (AAB)

Upload `aab/velbok-1.0.42-build43.aab` to Google Play Console — not installable directly on a phone.

## Google Play release notes (paste)

```
• Fixed light/opaque square behind the text cursor when typing in the app
• Checkout Charge stays tappable and shows a clear toast if items, artist, or client are missing
• Billing quantity fields can be cleared and retyped
• Transparent logo assets across the app UI
```

See `versions.json` for the full manifest.

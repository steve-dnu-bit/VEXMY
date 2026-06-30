# Velbok Android build archive

Exported builds found on this machine, renamed with version numbers.

## Latest — 1.0.38 (build 39)

**Google Play:** upload `aab/velbok-1.0.38-build39.aab` (~51 MB)

**Side-load APK:** `apk/velbok-1.0.38-build39.apk` (~50 MB)

### Changes
- Fixed bloated app size (~380 MB → ~50 MB) by excluding nested APKs from web assets
- Removed broad photo/storage permissions (Google Play policy); stencil and receipts use the system picker
- Android 15 edge-to-edge safe-area fixes for headers and bottom bars
- Fixed white status bar band on login and main screens
- Fixed login form hidden when keyboard opens

## Install APK (side-load)

```powershell
adb install -r "apk\velbok-1.0.38-build39.apk"
```

## Play Store bundle (AAB)

Upload `aab/velbok-1.0.38-build39.aab` to Google Play Console — not installable directly on a phone.

## Google Play release notes (paste)

```
• Google Play compliance: app no longer requests broad gallery access; photo picking uses the system picker
• Improved layout on Android 15+ (status bar and navigation bar)
• Fixed login screen display when the keyboard is open
• Reduced app download size
• Bug fixes and stability improvements
```

See `versions.json` for the full manifest.

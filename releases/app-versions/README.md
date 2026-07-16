# Velbok Android build archive

Every signed release is saved here with a fixed naming scheme:

```
apk/velbok-{versionName}-build{versionCode}.apk
aab/velbok-{versionName}-build{versionCode}.aab
```

Example: `aab/velbok-1.0.92-build92.aab`

After `assembleRelease` + `bundleRelease`, run:

```powershell
npm run android:archive
```

That also updates:

- `public/downloads/velbok-android.apk` (website sideload)
- `releases/velbok-release.apk` / `.aab` (latest convenience copies)
- `versions.json` (manifest)

`npm run build` / `copy-release-apk.mjs` call the same archive step, so website deploys stay consistent.

## Install APK (side-load)

```powershell
adb install -r "apk\velbok-1.0.92-build92.apk"
```

## Play Store bundle (AAB)

Upload `aab/velbok-*-build*.aab` to Google Play Console — not installable directly on a phone.

See `versions.json` for the full manifest.

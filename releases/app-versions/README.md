# Velbok Android build archive

Exported builds found on this machine, renamed with version numbers.

## Install APKs (side-load)

| Version | Build | File |
|---------|-------|------|
| **1.0.34** (latest) | 35 | `apk/velbok-1.0.34-build35.apk` |
| 1.0.20 | 21 | `apk/velbok-1.0.20-build21.apk` |
| 1.0.7 | 8 | `apk/velbok-1.0.7-build8.apk` |

```powershell
adb install -r "apk\velbok-1.0.20-build21.apk"
```

## Play Store bundles (AAB)

Upload these to Google Play Console — not installable directly on a phone.

| Version | File |
|---------|------|
| **1.0.34** (build 35) | `aab/velbok-1.0.34-build35.aab` |
| 1.0.17 (build 18) | `aab/velbok-1.0.17-build18.aab` |
| 1.0.15 | `aab/velbok-1.0.15.aab` |
| 1.0.14 | `aab/velbok-1.0.14.aab` |
| 1.0.13 | `aab/velbok-1.0.13.aab` |
| 1.0.12 | `aab/velbok-1.0.12.aab` |

## Missing APKs

Versions **1.0.8**, **1.0.10**, **1.0.12–1.0.17** were released as AABs only; standalone APK files were not kept. To regenerate an APK from an old commit:

```powershell
git checkout <commit>
npm run android:release
copy android\app\build\outputs\apk\release\app-release.apk releases\app-versions\apk\velbok-X.Y.Z-buildN.apk
```

See `versions.json` for the full manifest.

#!/usr/bin/env bash
# Build and upload Velbok iOS release from a Mac (cloud or local).
# Prerequisites: Xcode, Apple Developer account, signed in to Xcode.
#
# Usage:
#   export APPLE_TEAM_ID=XXXXXXXXXX   # 10-char Team ID from developer.apple.com
#   ./scripts/ios-archive.sh
#
# Optional:
#   SKIP_UPLOAD=1          — archive only, no App Store Connect upload
#   SKIP_NPM_INSTALL=1     — skip npm ci (if node_modules already present)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="ios/App/App.xcodeproj"
SCHEME="App"
ARCHIVE_PATH="$ROOT/ios/build/Velbok.xcarchive"
EXPORT_PATH="$ROOT/ios/build/export"
EXPORT_OPTIONS="$ROOT/ios/ExportOptions.plist"
IPA_PATH="$ROOT/releases/app-versions/ios/velbok-1.0.41-build42.ipa"

if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "Error: set APPLE_TEAM_ID (10-character Team ID from Apple Developer → Membership)."
  echo "Example: export APPLE_TEAM_ID=AB12CD34EF"
  exit 1
fi

if [[ ! -f "ios/App/App/GoogleService-Info.plist" ]]; then
  echo "Warning: ios/App/App/GoogleService-Info.plist is missing."
  echo "Push notifications will not work until you add it from Firebase Console."
  echo "See docs/app-store-release.md and docs/mobile-push-setup.md"
  read -r -p "Continue without Firebase plist? [y/N] " ans
  [[ "${ans:-}" =~ ^[Yy]$ ]] || exit 1
fi

echo "==> Installing npm dependencies"
if [[ -z "${SKIP_NPM_INSTALL:-}" ]]; then
  npm ci
fi

echo "==> Syncing Capacitor (web bundle → ios)"
npm run cap:sync

echo "==> Archiving (Release)"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -destination "generic/platform=iOS" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  -allowProvisioningUpdates \
  clean archive

mkdir -p "$(dirname "$IPA_PATH")"

if [[ -n "${SKIP_UPLOAD:-}" ]]; then
  echo "==> SKIP_UPLOAD set — exporting IPA locally"
  rm -rf "$EXPORT_PATH"
  xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS" \
    -allowProvisioningUpdates \
    || true
  if [[ -f "$EXPORT_PATH/App.ipa" ]]; then
    cp "$EXPORT_PATH/App.ipa" "$IPA_PATH"
    echo "IPA: $IPA_PATH"
  fi
  echo "Archive: $ARCHIVE_PATH"
  echo "Open in Xcode Organizer to upload manually if export failed."
  exit 0
fi

echo "==> Exporting and uploading to App Store Connect"
rm -rf "$EXPORT_PATH"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates

if [[ -f "$EXPORT_PATH/App.ipa" ]]; then
  cp "$EXPORT_PATH/App.ipa" "$IPA_PATH"
  echo "IPA copy: $IPA_PATH"
fi

echo "Done. Check App Store Connect → TestFlight / App Store for build processing."
echo "Enable 'Upload your app's symbols' if prompted — dSYMs help crash reports."

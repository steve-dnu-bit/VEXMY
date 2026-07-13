#!/usr/bin/env bash
# Build and export an App Store IPA. Requires macOS, Xcode, and valid signing.
#
# Optional:
#   SKIP_UPLOAD=1          — archive only, no App Store Connect upload
#   SKIP_NPM_INSTALL=1     — skip npm ci (if node_modules already present)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "ios/App/App/GoogleService-Info.plist" ]]; then
  echo "Warning: ios/App/App/GoogleService-Info.plist is missing."
  echo "Push notifications will not work until you add it from Firebase Console."
  echo "See docs/app-store-release.md and docs/mobile-push-setup.md"
  if [[ -z "${SKIP_FIREBASE_CHECK:-}" ]]; then
    read -r -p "Continue without Firebase plist? [y/N] " ans
    [[ "${ans:-}" =~ ^[Yy]$ ]] || exit 1
  fi
fi

if [[ -z "${SKIP_NPM_INSTALL:-}" ]]; then
  echo "==> Installing npm dependencies"
  npm ci
fi

npm run ios:prepare

ARCHIVE_DIR="$ROOT/releases/app-versions/ios"
ARCHIVE_PATH="$ARCHIVE_DIR/Velbok.xcarchive"
EXPORT_PATH="$ARCHIVE_DIR/export"
mkdir -p "$ARCHIVE_DIR"

cd ios/App

TEAM_ID="${DEVELOPMENT_TEAM:-NS8FATRNW3}"
REAL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles.real"
VOL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles"
USER_PROFILES="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"

if [[ -L "$VOL_PROFILES" ]] && [[ "$(readlink "$VOL_PROFILES")" == "$(readlink "$USER_PROFILES" 2>/dev/null || echo "")" ]]; then
  : # already fixed
elif [[ ! -d "$REAL_PROFILES" ]]; then
  bash "$ROOT/scripts/ios-fix-provisioning-folder.sh"
fi
mkdir -p "$REAL_PROFILES"
chmod -R u+rwx "$(dirname "$REAL_PROFILES")" 2>/dev/null || true

echo "Archiving Velbok (Release) with team $TEAM_ID and profile 'Velbok App Store'..."
xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Manual \
  PROVISIONING_PROFILE_SPECIFIER=f4346d1d-7aa3-4729-907f-2df189f33e29 \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  archive

if [[ -n "${SKIP_UPLOAD:-}" ]]; then
  echo "==> SKIP_UPLOAD set — exporting IPA locally only"
fi

echo "Exporting for App Store Connect..."
rm -rf "$EXPORT_PATH"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$ROOT/ios/ExportOptions.plist" \
  -allowProvisioningUpdates

echo "Done. IPA: $EXPORT_PATH/App.ipa"
echo "Check App Store Connect → TestFlight / App Store for build processing."
echo "Enable 'Upload your app's symbols' if prompted — dSYMs help crash reports."

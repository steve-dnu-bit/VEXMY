#!/usr/bin/env bash
# Build and export an App Store IPA. Requires macOS, Xcode, and valid signing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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
  PROVISIONING_PROFILE_SPECIFIER="Velbok App Store" \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  archive

echo "Exporting for App Store Connect..."
rm -rf "$EXPORT_PATH"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$ROOT/ios/ExportOptions.plist" \
  -allowProvisioningUpdates

echo "Done. IPA: $EXPORT_PATH/App.ipa"

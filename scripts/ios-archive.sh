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

TEAM_ID="${DEVELOPMENT_TEAM:-QFZ2RHAPT8}"
VOL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles"
mkdir -p "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
if [[ -d "$(dirname "$VOL_PROFILES")" ]]; then
  mkdir -p "$VOL_PROFILES"
  chmod -R u+rwx "$HOME/Library/Developer/Xcode/UserData" 2>/dev/null || true
  chmod -R u+rwx "/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData" 2>/dev/null || true
fi

echo "Archiving Velbok (Release) with team $TEAM_ID..."
xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
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

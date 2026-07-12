#!/usr/bin/env bash
# Archive + export a Development IPA for Diawi / registered test iPhones.
# Avoids Xcode Organizer (often freezes on MacinCloud).
#
# Prereq: Development profile "pay_test_velbok" installed, with your iPhone UDID.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TEAM_ID="${DEVELOPMENT_TEAM:-NS8FATRNW3}"
PROFILE_NAME="${PROVISIONING_PROFILE_NAME:-pay_test_velbok}"
ARCHIVE_DIR="$ROOT/releases/app-versions/ios"
ARCHIVE_PATH="$ARCHIVE_DIR/Velbok-Development.xcarchive"
EXPORT_PATH="$ARCHIVE_DIR/export-development"
EXPORT_PLIST="$ROOT/ios/ExportOptions-development.plist"

bash "$ROOT/scripts/ios-fix-provisioning-folder.sh" 2>/dev/null || true
bash "$ROOT/scripts/ios-install-provisioning-profile.sh" 2>/dev/null || true

mkdir -p "$ARCHIVE_DIR"
rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"
mkdir -p "$EXPORT_PATH"

echo "==> Archiving Development/Release (profile: $PROFILE_NAME)..."
cd "$ROOT/ios/App"
xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Manual \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE_NAME" \
  CODE_SIGN_IDENTITY="Apple Development" \
  archive

echo "==> Exporting Development IPA (no Xcode UI)..."
cd "$ROOT"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -allowProvisioningUpdates

IPA="$(find "$EXPORT_PATH" -name '*.ipa' -print -quit)"
if [[ -z "$IPA" ]]; then
  echo "Export failed — no IPA created."
  echo "Fallback: packaging Payload from archive..."
  bash "$ROOT/scripts/ios-ipa-from-archive.sh" "$ARCHIVE_PATH"
  IPA="$ROOT/releases/app-versions/ios/export/App.ipa"
fi

echo ""
echo "========================================"
echo "  DEVELOPMENT IPA READY"
echo "========================================"
echo "IPA: $IPA"
echo ""
echo "Next:"
echo "  1. Open https://www.diawi.com in Safari on this Mac"
echo "  2. Upload that IPA"
echo "  3. Open the Diawi link in Safari on your iPhone → Install"
echo "  4. Settings → General → VPN & Device Management → Trust"

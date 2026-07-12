#!/usr/bin/env bash
# Archive + export a Development IPA for Diawi / registered test iPhones.
# Uses Automatic signing so SPM packages (IONCameraLib etc.) do not inherit a manual profile.
# Avoids Xcode Organizer (often freezes on MacinCloud).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TEAM_ID="${DEVELOPMENT_TEAM:-NS8FATRNW3}"
ARCHIVE_DIR="$ROOT/releases/app-versions/ios"
ARCHIVE_PATH="$ARCHIVE_DIR/Velbok-Development.xcarchive"
EXPORT_PATH="$ARCHIVE_DIR/export-development"
EXPORT_PLIST="$ROOT/ios/ExportOptions-development.plist"
REAL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles.real"

bash "$ROOT/scripts/ios-fix-provisioning-folder.sh" 2>/dev/null || true

# Install newest Development-looking profile from Downloads if present
CANDIDATE="$(ls -t "$HOME"/Downloads/*pay_test*.mobileprovision "$HOME"/Downloads/*Development*.mobileprovision "$HOME"/Downloads/*.mobileprovision 2>/dev/null | head -1 || true)"
if [[ -n "${CANDIDATE:-}" && -f "$CANDIDATE" ]]; then
  echo "==> Installing profile from Downloads:"
  echo "    $CANDIDATE"
  bash "$ROOT/scripts/ios-install-provisioning-profile.sh" "$CANDIDATE"
fi

echo "==> Installed profiles (name / app id / has Tap to Pay?):"
shopt -s nullglob
for f in "$REAL_PROFILES"/*.mobileprovision "$HOME/Library/MobileDevice/Provisioning Profiles"/*.mobileprovision; do
  [[ -f "$f" ]] || continue
  name="$(security cms -D -i "$f" 2>/dev/null | plutil -extract Name raw -o - - 2>/dev/null || echo "?")"
  app="$(security cms -D -i "$f" 2>/dev/null | plutil -extract Entitlements.application-identifier raw -o - - 2>/dev/null || echo "?")"
  ttp="no"
  security cms -D -i "$f" 2>/dev/null | grep -q proximity-reader && ttp="YES"
  echo "  - $name | $app | TapToPay=$ttp"
done
echo ""

mkdir -p "$ARCHIVE_DIR"
rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"
mkdir -p "$EXPORT_PATH"

echo "==> Archiving with Automatic signing (team $TEAM_ID)..."
echo "    git HEAD=$(git -C "$ROOT" rev-parse --short HEAD)"
cd "$ROOT/ios/App"
# Clear any manual profile so SPM packages (IONCameraLib) are not forced onto pay_test_velbok.
xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  CODE_SIGN_IDENTITY="Apple Development" \
  PROVISIONING_PROFILE_SPECIFIER= \
  PROVISIONING_PROFILE= \
  archive

echo "==> Exporting Development IPA..."
cd "$ROOT"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -allowProvisioningUpdates

IPA="$(find "$EXPORT_PATH" -name '*.ipa' -print -quit)"
if [[ -z "$IPA" ]]; then
  echo "exportArchive produced no IPA — packaging from archive Payload..."
  bash "$ROOT/scripts/ios-ipa-from-archive.sh" "$ARCHIVE_PATH"
  # ios-ipa-from-archive writes to export/ not export-development/
  IPA="$ROOT/releases/app-versions/ios/export/App.ipa"
  mkdir -p "$EXPORT_PATH"
  cp -f "$IPA" "$EXPORT_PATH/App.ipa" 2>/dev/null || true
  IPA="$EXPORT_PATH/App.ipa"
fi

echo ""
echo "========================================"
echo "  DEVELOPMENT IPA READY"
echo "========================================"
echo "IPA: $IPA"
echo ""
echo "Next: upload to https://www.diawi.com then open the link in Safari on your iPhone."

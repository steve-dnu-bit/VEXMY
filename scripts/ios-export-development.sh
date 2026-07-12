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

echo "==> Syncing mobile version from scripts/mobile-version.json..."
node "$ROOT/scripts/sync-mobile-version.mjs"
EXPECTED_VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/mobile-version.json','utf8')).versionName)")"
PBX_VERSION="$(grep -m1 'MARKETING_VERSION' "$ROOT/ios/App/App.xcodeproj/project.pbxproj" | sed -E 's/.*=[[:space:]]*([^;]+);/\1/' | tr -d '[:space:]')"
echo "    expected version: $EXPECTED_VERSION"
echo "    project.pbxproj:  $PBX_VERSION"
if [[ "$PBX_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "ERROR: project.pbxproj MARKETING_VERSION ($PBX_VERSION) != mobile-version.json ($EXPECTED_VERSION)"
  exit 1
fi

echo "==> Ensuring Stripe Terminal iOS patches are applied..."
node "$ROOT/scripts/patch-stripe-terminal-ios.mjs"
PLUGIN_SWIFT="$ROOT/node_modules/@capacitor-community/stripe-terminal/ios/Sources/StripeTerminalPlugin/StripeTerminal.swift"
if [[ ! -f "$PLUGIN_SWIFT" ]]; then
  echo "ERROR: Stripe Terminal iOS plugin missing. Run: npm install && npm run ios:prepare"
  exit 1
fi
if ! grep -q "velbok: ios finish-update nil crash fix v2" "$PLUGIN_SWIFT"; then
  echo "ERROR: WisePad crash patch missing from StripeTerminal.swift — refuse to archive."
  exit 1
fi
if ! grep -q "velbok: ios listener payload json-safe v3" "$PLUGIN_SWIFT"; then
  echo "ERROR: Listener JSON-safe patch (v3) missing — refuse to archive."
  exit 1
fi
echo "    Stripe Terminal crash patches OK"

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

INFO_PLIST="$ARCHIVE_PATH/Products/Applications/App.app/Info.plist"
ARCHIVED_VERSION="?"
ARCHIVED_BUILD="?"
if [[ -f "$INFO_PLIST" ]]; then
  ARCHIVED_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$INFO_PLIST" 2>/dev/null || echo "?")"
  ARCHIVED_BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$INFO_PLIST" 2>/dev/null || echo "?")"
fi

echo ""
echo "========================================"
echo "  DEVELOPMENT IPA READY"
echo "========================================"
echo "Version: $ARCHIVED_VERSION ($ARCHIVED_BUILD)"
echo "IPA: $IPA"
if [[ "$ARCHIVED_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "WARNING: archived CFBundleShortVersionString is $ARCHIVED_VERSION, expected $EXPECTED_VERSION"
  echo "         Do not install this IPA — clean DerivedData and rebuild."
  exit 1
fi
echo ""
echo "Next: upload to https://www.diawi.com then open the link in Safari on your iPhone."
echo "On iPhone Settings → General → iPhone Storage → Velbok, confirm version $EXPECTED_VERSION."

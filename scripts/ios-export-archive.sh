#!/usr/bin/env bash
# Export an existing .xcarchive to App Store IPA (bypasses Xcode Organizer upload UI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCHIVE_PATH="${1:-}"
if [[ -z "$ARCHIVE_PATH" ]]; then
  ARCHIVE_PATH="$(ls -td "$HOME"/Library/Developer/Xcode/Archives/*/*.xcarchive 2>/dev/null | head -1 || true)"
fi
if [[ -z "$ARCHIVE_PATH" && -d "$ROOT/releases/app-versions/ios/Velbok.xcarchive" ]]; then
  ARCHIVE_PATH="$ROOT/releases/app-versions/ios/Velbok.xcarchive"
fi
if [[ -z "$ARCHIVE_PATH" || ! -d "$ARCHIVE_PATH" ]]; then
  echo "Usage: bash scripts/ios-export-archive.sh [/path/to/App.xcarchive]"
  echo "No archive found. Create one first with Product → Archive in Xcode."
  exit 1
fi

EXPORT_PATH="$ROOT/releases/app-versions/ios/export"
rm -rf "$EXPORT_PATH"
mkdir -p "$EXPORT_PATH"

bash "$ROOT/scripts/ios-fix-provisioning-folder.sh" 2>/dev/null || true
bash "$ROOT/scripts/ios-install-provisioning-profile.sh" 2>/dev/null || true

echo "Exporting archive:"
echo "  $ARCHIVE_PATH"
echo ""

set +e
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$ROOT/ios/ExportOptions.plist" \
  -allowProvisioningUpdates 2>&1 | tee "$ROOT/ios-export.log"
STATUS=${PIPESTATUS[0]}
set -e

if [[ "$STATUS" -ne 0 ]]; then
  echo ""
  echo "Manual export failed — trying automatic signing export..."
  xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_PATH" \
    -exportOptionsPlist "$ROOT/ios/ExportOptions-automatic.plist" \
    -allowProvisioningUpdates 2>&1 | tee -a "$ROOT/ios-export.log"
fi

IPA="$(find "$EXPORT_PATH" -name '*.ipa' -print -quit)"
if [[ -z "$IPA" ]]; then
  echo ""
  echo "Export failed. Last errors:"
  grep -E "error:|No profiles" "$ROOT/ios-export.log" | tail -20 || true
  exit 1
fi

echo ""
echo "========================================"
echo "  EXPORT SUCCEEDED"
echo "========================================"
echo "IPA: $IPA"
echo ""
echo "Upload with Transporter app:"
echo "  1. Open Transporter (Mac App Store)"
echo "  2. Drag this IPA into Transporter"
echo "  3. Click Deliver"

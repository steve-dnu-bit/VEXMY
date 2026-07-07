#!/usr/bin/env bash
# Package an existing .xcarchive into an IPA without xcodebuild -exportArchive.
# Use when exportArchive cannot find provisioning profiles on MacinCloud.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCHIVE_PATH="${1:-}"
if [[ -z "$ARCHIVE_PATH" ]]; then
  ARCHIVE_PATH="$(ls -td "$HOME"/Library/Developer/Xcode/Archives/*/*.xcarchive 2>/dev/null | head -1 || true)"
fi
if [[ -z "$ARCHIVE_PATH" || ! -d "$ARCHIVE_PATH" ]]; then
  echo "Usage: bash scripts/ios-ipa-from-archive.sh [/path/to/App.xcarchive]"
  exit 1
fi

APP_PATH="$ARCHIVE_PATH/Products/Applications/App.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo "Missing app bundle: $APP_PATH"
  exit 1
fi

EXPORT_PATH="$ROOT/releases/app-versions/ios/export"
WORK="$ROOT/releases/app-versions/ios/ipa-work"
rm -rf "$WORK" "$EXPORT_PATH/App.ipa"
mkdir -p "$EXPORT_PATH" "$WORK/Payload"

echo "Packaging IPA from archive:"
echo "  $ARCHIVE_PATH"
echo ""

cp -R "$APP_PATH" "$WORK/Payload/App.app"
(
  cd "$WORK"
  zip -qr "$EXPORT_PATH/App.ipa" Payload
)

echo "Checking signature on packaged app..."
codesign -dv --verbose=4 "$APP_PATH" 2>&1 | grep -E "Identifier=|Authority=|TeamIdentifier=" || true

echo ""
echo "========================================"
echo "  IPA CREATED"
echo "========================================"
echo "IPA: $EXPORT_PATH/App.ipa"
echo ""
echo "Upload with Transporter:"
echo "  open -a Transporter"
echo "  Drag $EXPORT_PATH/App.ipa into Transporter → Deliver"

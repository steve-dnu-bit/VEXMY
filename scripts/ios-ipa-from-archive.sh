#!/usr/bin/env bash
# Package an existing .xcarchive into an IPA without xcodebuild -exportArchive.
# Use when exportArchive cannot find provisioning profiles on MacinCloud.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VELBOK_ROOT="$ROOT"
# shellcheck source=scripts/ios-archive-lib.sh
source "$ROOT/scripts/ios-archive-lib.sh"

ARCHIVE_PATH="$(velbok_pick_archive "${1:-}" || true)"
if [[ -z "$ARCHIVE_PATH" || ! -d "$ARCHIVE_PATH" ]]; then
  echo "Usage: bash scripts/ios-ipa-from-archive.sh [/path/to/App.xcarchive]"
  echo "No archive found. Build one with: npm run ios:archive"
  exit 1
fi

echo "==> Archive selected for packaging"
velbok_describe_archive "$ARCHIVE_PATH"
velbok_assert_archive_version "$ARCHIVE_PATH"

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
echo "########################################################################"
echo "  IPA CREATED — $(velbok_expected_version) ($(velbok_expected_build))"
echo "########################################################################"
echo "  from archive: $ARCHIVE_PATH"
echo "  IPA:          $EXPORT_PATH/App.ipa"
echo ""
echo "  Upload with Transporter:"
echo "    open -a Transporter"
echo "    Drag $EXPORT_PATH/App.ipa into Transporter → Deliver"
echo ""
echo "  Do NOT upload from Xcode Organizer — Organizer does not list this"
echo "  archive and will offer you an older one instead."
echo "########################################################################"

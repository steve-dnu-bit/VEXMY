#!/usr/bin/env bash
# Export an existing .xcarchive to App Store IPA (bypasses Xcode Organizer upload UI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VELBOK_ROOT="$ROOT"
# shellcheck source=scripts/ios-archive-lib.sh
source "$ROOT/scripts/ios-archive-lib.sh"

ARCHIVE_PATH="$(velbok_pick_archive "${1:-}" || true)"
if [[ -z "$ARCHIVE_PATH" || ! -d "$ARCHIVE_PATH" ]]; then
  echo "Usage: bash scripts/ios-export-archive.sh [/path/to/App.xcarchive]"
  echo "No archive found. Build one with: npm run ios:archive"
  exit 1
fi

echo "==> Archive selected for export"
velbok_describe_archive "$ARCHIVE_PATH"
velbok_assert_archive_version "$ARCHIVE_PATH"

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

IPA_VERSION="?"
IPA_BUILD="?"
IPA_WORK="$(mktemp -d)"
if unzip -q -o "$IPA" -d "$IPA_WORK" 2>/dev/null; then
  IPA_PLIST="$(find "$IPA_WORK/Payload" -maxdepth 2 -name Info.plist -print -quit)"
  if [[ -n "$IPA_PLIST" ]]; then
    IPA_VERSION="$(velbok_plist_get "$IPA_PLIST" CFBundleShortVersionString)"
    IPA_BUILD="$(velbok_plist_get "$IPA_PLIST" CFBundleVersion)"
  fi
fi
rm -rf "$IPA_WORK"

EXPECTED_VERSION="$(velbok_expected_version)"
EXPECTED_BUILD="$(velbok_expected_build)"
if [[ "$IPA_VERSION" != "$EXPECTED_VERSION" || "$IPA_BUILD" != "$EXPECTED_BUILD" ]]; then
  echo ""
  echo "ERROR: exported IPA is $IPA_VERSION ($IPA_BUILD), expected $EXPECTED_VERSION ($EXPECTED_BUILD)."
  echo "       Do not upload it. Check manageAppVersionAndBuildNumber in ios/ExportOptions*.plist."
  exit 1
fi

echo ""
echo "########################################################################"
echo "  EXPORT SUCCEEDED — $IPA_VERSION ($IPA_BUILD)"
echo "########################################################################"
echo "  from archive: $ARCHIVE_PATH"
echo "  IPA:          $IPA"
echo ""
echo "  Verify it yourself:"
echo "    bash scripts/ios-verify-archive.sh"
echo ""
echo "  Upload with Transporter app:"
echo "    1. Open Transporter (Mac App Store)"
echo "    2. Drag the IPA above into Transporter"
echo "    3. Click Deliver"
echo ""
echo "  Do NOT upload from Xcode Organizer — Organizer does not list this"
echo "  archive and will offer you an older one instead."
echo "########################################################################"

#!/usr/bin/env bash
# Print installed provisioning profiles and verify Velbok App Store profile.
set -euo pipefail

REAL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles.real"

echo "Provisioning profile folder:"
echo "  $REAL_PROFILES"
echo ""

if [[ ! -d "$REAL_PROFILES" ]]; then
  echo "Folder missing. Run: bash scripts/ios-fix-provisioning-folder.sh"
  exit 1
fi

shopt -s nullglob
files=("$REAL_PROFILES"/*.mobileprovision)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "No .mobileprovision files installed."
  echo "Run: bash scripts/ios-install-provisioning-profile.sh ~/Downloads/Velbok_App_Store.mobileprovision"
  exit 1
fi

for file in "${files[@]}"; do
  name="$(security cms -D -i "$file" 2>/dev/null | plutil -extract Name raw -o - - 2>/dev/null || echo "?")"
  uuid="$(security cms -D -i "$file" 2>/dev/null | plutil -extract UUID raw -o - - 2>/dev/null || echo "?")"
  app_id="$(security cms -D -i "$file" 2>/dev/null | plutil -extract Entitlements.application-identifier raw -o - - 2>/dev/null || echo "?")"
  echo "- $(basename "$file")"
  echo "  Name: $name"
  echo "  UUID: $uuid"
  echo "  App ID: $app_id"
  echo ""
done

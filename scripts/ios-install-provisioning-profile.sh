#!/usr/bin/env bash
# Manually install a downloaded .mobileprovision into the MacinCloud-safe folder.
set -euo pipefail

PROFILE="${1:-}"
REAL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles.real"

if [[ -z "$PROFILE" ]]; then
  PROFILE="$(ls -t ~/Downloads/*.mobileprovision 2>/dev/null | head -1 || true)"
fi

if [[ -z "$PROFILE" || ! -f "$PROFILE" ]]; then
  echo "Usage: bash scripts/ios-install-provisioning-profile.sh [/path/to/profile.mobileprovision]"
  echo "No .mobileprovision found in ~/Downloads"
  exit 1
fi

bash "$(dirname "$0")/ios-fix-provisioning-folder.sh"

DEST="$REAL_PROFILES/$(basename "$PROFILE")"
cp "$PROFILE" "$DEST"
echo "Installed provisioning profile:"
echo "  $DEST"
echo ""
echo "Next:"
echo "  1. Xcode → Settings → Accounts → Download Manual Profiles"
echo "  2. Organizer → Distribute App → App Store Connect → Upload"

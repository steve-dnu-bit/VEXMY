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

PROFILE_UUID="$(security cms -D -i "$PROFILE" 2>/dev/null | plutil -extract UUID raw -o - - 2>/dev/null || true)"
PROFILE_NAME="$(security cms -D -i "$PROFILE" 2>/dev/null | plutil -extract Name raw -o - - 2>/dev/null || true)"
APP_ID="$(security cms -D -i "$PROFILE" 2>/dev/null | plutil -extract Entitlements.application-identifier raw -o - - 2>/dev/null || true)"

if [[ -z "$PROFILE_UUID" ]]; then
  echo "Could not read profile UUID from: $PROFILE"
  exit 1
fi

DEST="$REAL_PROFILES/${PROFILE_UUID}.mobileprovision"
cp "$PROFILE" "$DEST"
echo "Installed provisioning profile:"
echo "  File: $DEST"
echo "  Name: ${PROFILE_NAME:-unknown}"
echo "  UUID: $PROFILE_UUID"
echo "  App ID: ${APP_ID:-unknown}"
echo ""
echo "Use this exact profile name in Xcode if asked:"
echo "  ${PROFILE_NAME:-Velbok App Store}"
echo ""
echo "Next:"
echo "  1. Quit and reopen Xcode"
echo "  2. Xcode → Settings → Accounts → Download Manual Profiles"
echo "  3. Organizer → Distribute App → App Store Connect → Upload"

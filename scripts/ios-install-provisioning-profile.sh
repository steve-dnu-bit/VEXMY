#!/usr/bin/env bash
# Manually install a downloaded .mobileprovision into all folders Xcode/xcodebuild reads.
set -euo pipefail

PROFILE="${1:-}"
REAL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles.real"
XCODE_PROFILES="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
MOBILE_PROFILES="$HOME/Library/MobileDevice/Provisioning Profiles"
VOL_MOBILE_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/MobileDevice/Provisioning Profiles"

if [[ -z "$PROFILE" ]]; then
  PROFILE="$(ls -t ~/Downloads/*.mobileprovision 2>/dev/null | head -1 || true)"
fi

if [[ -z "$PROFILE" || ! -f "$PROFILE" ]]; then
  PROFILE="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles.real/"*.mobileprovision
  PROFILE="$(ls -t $PROFILE 2>/dev/null | head -1 || true)"
fi

if [[ -z "$PROFILE" || ! -f "$PROFILE" ]]; then
  echo "Usage: bash scripts/ios-install-provisioning-profile.sh [/path/to/profile.mobileprovision]"
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

install_copy() {
  local dir="$1"
  mkdir -p "$dir"
  cp "$PROFILE" "$dir/${PROFILE_UUID}.mobileprovision"
  echo "  $dir/${PROFILE_UUID}.mobileprovision"
}

echo "Installing provisioning profile:"
echo "  Name: ${PROFILE_NAME:-unknown}"
echo "  UUID: $PROFILE_UUID"
echo "  App ID: ${APP_ID:-unknown}"
echo ""
install_copy "$REAL_PROFILES"
install_copy "$MOBILE_PROFILES"
if [[ -d "$(dirname "$VOL_MOBILE_PROFILES")" ]]; then
  install_copy "$VOL_MOBILE_PROFILES"
fi
if [[ -e "$XCODE_PROFILES" || -L "$XCODE_PROFILES" ]]; then
  install_copy "$(readlink -f "$XCODE_PROFILES" 2>/dev/null || echo "$REAL_PROFILES")"
fi

echo ""
echo "Done. Next:"
echo "  npm run ios:export"

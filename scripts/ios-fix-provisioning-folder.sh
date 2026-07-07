#!/usr/bin/env bash
# Fix MacinCloud circular symlinks in Xcode Provisioning Profiles folder.
set -euo pipefail

USER_PROFILES="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
VOL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles"
REAL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles.real"

echo "==> Removing broken provisioning profile symlinks..."
rm -rf "$USER_PROFILES" 2>/dev/null || true
rm -rf "$VOL_PROFILES" 2>/dev/null || true
rm -rf "$REAL_PROFILES" 2>/dev/null || true

echo "==> Creating real provisioning profile folder..."
mkdir -p "$REAL_PROFILES"
chmod -R u+rwx "$(dirname "$REAL_PROFILES")"

# One-way link only: Xcode on MacinCloud writes to /Volumes/Macintosh_HD/...
ln -sf "$REAL_PROFILES" "$VOL_PROFILES"
mkdir -p "$(dirname "$USER_PROFILES")"
ln -sf "$REAL_PROFILES" "$USER_PROFILES"

echo "==> Testing write access..."
TEST_FILE="$REAL_PROFILES/.write-test"
touch "$TEST_FILE"
rm -f "$TEST_FILE"

echo ""
echo "Fixed. Provisioning Profiles folder:"
echo "  $REAL_PROFILES"
echo ""
echo "Next:"
echo "  1. Xcode → Settings → Accounts → Download Manual Profiles"
echo "  2. npm run ios:archive"

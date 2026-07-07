#!/usr/bin/env bash
# Clear stale Xcode signing caches that cause missing .mobileprovision errors (common on MacinCloud).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Quit Xcode before continuing (Cmd+Q)."
echo "==> Resetting Xcode signing caches for Velbok..."

echo "Removing project xcuserdata (stale profile UUID references)..."
rm -rf ios/App/App.xcodeproj/project.xcworkspace/xcuserdata
rm -rf ios/App/App.xcodeproj/xcuserdata

echo "Removing DerivedData for App..."
rm -rf ~/Library/Developer/Xcode/DerivedData/App-*

USER_PROFILES="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
VOL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles"

echo "Fixing provisioning profile folder permissions..."
mkdir -p "$USER_PROFILES"
chmod -R u+rwx "$HOME/Library/Developer/Xcode/UserData" 2>/dev/null || true

if [[ -d "$(dirname "$VOL_PROFILES")" ]]; then
  mkdir -p "$(dirname "$VOL_PROFILES")"
  # Prefer a real writable folder on the MacinCloud volume (Xcode often writes here).
  if [[ -L "$VOL_PROFILES" ]]; then
    rm -f "$VOL_PROFILES"
  fi
  mkdir -p "$VOL_PROFILES"
  chmod -R u+rwx "/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData" 2>/dev/null || true
  # Keep ~/Library path in sync when both exist.
  if [[ "$USER_PROFILES" != "$VOL_PROFILES" && -d "$USER_PROFILES" ]]; then
    rm -rf "$USER_PROFILES"/*
  fi
  if [[ "$USER_PROFILES" != "$VOL_PROFILES" && ! -e "$USER_PROFILES" ]]; then
    ln -sf "$VOL_PROFILES" "$USER_PROFILES"
  fi
fi

echo ""
echo "Done."
echo ""
echo "Next (in order):"
echo "  1. Open Xcode → Settings → Accounts → sign in with your Apple ID"
echo "  2. Select your account → Download Manual Profiles"
echo "  3. Confirm you see team: Stefan Dinu (QFZ2RHAPT8)"
echo "  4. Target App → Signing & Capabilities → Automatically manage signing ON"
echo "  5. Team: Stefan Dinu, Bundle ID: com.velbok.app — wait until no red errors"
echo "  6. Archive from Terminal:"
echo "       npm run ios:archive"

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

echo "Removing stale provisioning profiles..."
mkdir -p ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles
rm -rf ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*

# MacinCloud often uses /Volumes/Macintosh_HD/... while Xcode also reads ~/Library/...
VOL_BASE="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData"
USER_BASE="$HOME/Library/Developer/Xcode/UserData"
VOL_PROFILES="$VOL_BASE/Provisioning Profiles"
USER_PROFILES="$USER_BASE/Provisioning Profiles"

mkdir -p "$USER_PROFILES"
if [[ -d "$(dirname "$VOL_PROFILES")" ]]; then
  if [[ -e "$VOL_PROFILES" && ! -L "$VOL_PROFILES" ]]; then
    rm -rf "$VOL_PROFILES"
  fi
  if [[ ! -e "$VOL_PROFILES" ]]; then
    echo "Linking MacinCloud provisioning profile folder..."
    ln -sf "$USER_PROFILES" "$VOL_PROFILES"
  fi
fi

echo ""
echo "Done."
echo ""
echo "Next (in order):"
echo "  1. Open Xcode → Settings → Accounts → your Apple ID → Download Manual Profiles"
echo "  2. Target App → Signing & Capabilities → toggle Automatically manage signing off/on"
echo "  3. Team: Stefan Dinu, Bundle ID: com.velbok.app — wait until no red errors"
echo "  4. Archive from Terminal (more reliable on MacinCloud):"
echo "       npm run ios:archive"
echo "     Or in Xcode: Product → Archive (after signing is green)"

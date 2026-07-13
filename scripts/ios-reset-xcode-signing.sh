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

echo "Fixing provisioning profile folder (MacinCloud symlink loops)..."
bash "$ROOT/scripts/ios-fix-provisioning-folder.sh"

echo ""
echo "Done."
echo ""
echo "Next (in order):"
echo "  1. Open Xcode → Settings → Accounts → sign in with your Apple ID"
echo "  2. Select your account → Download Manual Profiles"
echo "  3. Confirm you see team: Stefan Dinu (NS8FATRNW3)"
echo "  4. Target App → Signing & Capabilities → Automatically manage signing ON"
echo "  5. Team: Stefan Dinu, Bundle ID: com.velbok.app — wait until no red errors"
echo "  6. Archive from Terminal:"
echo "       npm run ios:archive"

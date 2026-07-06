#!/usr/bin/env bash
# Clear stale Xcode signing caches that cause missing .mobileprovision errors.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Removing local Xcode user data for this project..."
rm -rf ios/App/App.xcodeproj/project.xcworkspace/xcuserdata
rm -rf ios/App/App.xcodeproj/xcuserdata

echo "Removing DerivedData for App..."
rm -rf ~/Library/Developer/Xcode/DerivedData/App-*

echo "Done."
echo ""
echo "Next:"
echo "  1. Open Xcode: npm run cap:ios"
echo "  2. Target App → Signing & Capabilities"
echo "  3. Enable 'Automatically manage signing'"
echo "  4. Select your Apple Developer Team"
echo "  5. For first test, choose an iPhone Simulator (no provisioning profile needed)"
echo "  6. Product → Clean Build Folder, then build again"

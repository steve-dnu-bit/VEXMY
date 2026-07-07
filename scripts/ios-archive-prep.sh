#!/usr/bin/env bash
# Prepare Mac/Xcode for App Store archive after simulator builds work.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash scripts/ios-reset-xcode-signing.sh

echo ""
echo "==> Downloading fresh provisioning profiles from Apple..."
if xcodebuild -downloadAllPlatforms 2>/dev/null; then
  echo "Platform components check complete."
else
  echo "(Optional platform download skipped — continue in Xcode Accounts if needed.)"
fi

echo ""
echo "Ready to archive. Run:"
echo "  npm run ios:archive"

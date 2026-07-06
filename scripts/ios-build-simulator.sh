#!/usr/bin/env bash
# Build Velbok iOS for Simulator from Terminal (shows real progress when Xcode GUI hangs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Checking npm dependencies..."
if [ ! -d node_modules/@capacitor/app ]; then
  echo "Missing node_modules. Run: npm install"
  exit 1
fi

echo "==> Preparing iOS web bundle..."
npm run ios:prepare

cd ios/App

SIM_NAME="${1:-}"
if [ -z "$SIM_NAME" ]; then
  SIM_NAME="$(xcrun simctl list devices available | grep -E 'iPhone.*\(Booted\)' | head -1 | sed -E 's/^[[:space:]]*([^(]+).*/\1/' | xargs || true)"
fi
if [ -z "$SIM_NAME" ]; then
  SIM_NAME="$(xcrun simctl list devices available | grep -E 'iPhone' | head -1 | sed -E 's/^[[:space:]]*([^(]+).*/\1/' | xargs || true)"
fi
if [ -z "$SIM_NAME" ]; then
  echo "No iPhone Simulator found. Open Xcode → Settings → Platforms and install an iOS simulator."
  exit 1
fi

echo "==> Using simulator: $SIM_NAME"
echo "==> Resolving Swift packages (this can take several minutes)..."
xcodebuild -project App.xcodeproj -scheme App -resolvePackageDependencies

echo "==> Building Debug for Simulator..."
xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "platform=iOS Simulator,name=${SIM_NAME}" \
  build

echo ""
echo "Build succeeded."
echo "Open Xcode, select '$SIM_NAME', and press Run — or install from DerivedData."

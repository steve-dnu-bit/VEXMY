#!/usr/bin/env bash
# Build Velbok iOS for Simulator from Terminal (shows real progress when Xcode GUI hangs).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG_FILE="${ROOT}/ios-build-simulator.log"

echo "==> Checking npm dependencies..."
if [ ! -d node_modules/@capacitor/app ]; then
  echo "FAILED: Missing node_modules. Run: npm install"
  exit 1
fi

echo "==> Preparing iOS web bundle..."
if ! npm run ios:prepare; then
  echo "FAILED: ios:prepare did not complete."
  exit 1
fi

cd ios/App

SIM_NAME="${1:-}"
if [ -z "$SIM_NAME" ]; then
  SIM_NAME="$(xcrun simctl list devices available | grep -E 'iPhone.*\(Booted\)' | head -1 | sed -E 's/^[[:space:]]*([^(]+).*/\1/' | xargs || true)"
fi
if [ -z "$SIM_NAME" ]; then
  SIM_NAME="$(xcrun simctl list devices available | grep -E 'iPhone' | head -1 | sed -E 's/^[[:space:]]*([^(]+).*/\1/' | xargs || true)"
fi
if [ -z "$SIM_NAME" ]; then
  echo "FAILED: No iPhone Simulator found."
  exit 1
fi

echo "==> Using simulator: $SIM_NAME"
echo "==> Full log: $LOG_FILE"
echo "==> Resolving Swift packages..."
if ! xcodebuild -project App.xcodeproj -scheme App -resolvePackageDependencies 2>&1 | tee -a "$LOG_FILE"; then
  echo ""
  echo "========================================"
  echo "  FAILED — could not resolve packages"
  echo "========================================"
  exit 1
fi

echo "==> Building Debug for Simulator (first build can take 20–40 min)..."
set +e
xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "platform=iOS Simulator,name=${SIM_NAME}" \
  build 2>&1 | tee -a "$LOG_FILE"
BUILD_EXIT=${PIPESTATUS[0]}
set -e

echo ""
if [ "$BUILD_EXIT" -eq 0 ] && grep -q "BUILD SUCCEEDED" "$LOG_FILE"; then
  APP_PATH="$(find ~/Library/Developer/Xcode/DerivedData -name "App.app" -path "*Debug-iphonesimulator*" -print -quit 2>/dev/null || true)"
  echo "========================================"
  echo "  BUILD SUCCEEDED"
  echo "========================================"
  if [ -n "$APP_PATH" ]; then
    echo "App bundle: $APP_PATH"
  fi
  echo ""
  echo "Next: npm run cap:ios → select '$SIM_NAME' → Run"
  exit 0
fi

echo "========================================"
  echo "  BUILD FAILED (exit code $BUILD_EXIT)"
echo "========================================"
echo "Last errors from log:"
grep -E "error:|fatal error:|BUILD FAILED" "$LOG_FILE" | tail -20 || true
echo ""
echo "Full log: $LOG_FILE"
exit 1

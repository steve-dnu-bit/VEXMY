#!/usr/bin/env bash
# Faster Simulator build: no Stripe Terminal SDK, local DerivedData, minimal assets.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG_FILE="${ROOT}/ios-build-lite.log"
DERIVED_DATA="${ROOT}/ios/DerivedData"

echo "========================================"
echo "  Velbok iOS LITE build (Simulator)"
echo "  Skips Stripe Terminal for speed."
echo "  POS Tap to Pay will not work in this build."
echo "========================================"
echo ""

if [ ! -d node_modules/@capacitor/app ]; then
  echo "FAILED: Run npm install first."
  exit 1
fi

if [ ! -f ios/App/App/public/index.html ]; then
  echo "==> No web bundle found, running ios:prepare..."
  npm run ios:prepare || exit 1
else
  echo "==> Using existing ios/App/App/public web bundle"
fi

node scripts/ios-lite-packages.mjs lite
node scripts/fix-ios-spm-paths.mjs

rm -rf "${DERIVED_DATA}" ios/App/CapApp-SPM/.build
mkdir -p "${DERIVED_DATA}"

cd ios/App

SIM_NAME="${1:-}"
if [ -z "$SIM_NAME" ]; then
  SIM_NAME="$(xcrun simctl list devices available | grep -E 'iPhone' | head -1 | sed -E 's/^[[:space:]]*([^(]+).*/\1/' | xargs || true)"
fi
if [ -z "$SIM_NAME" ]; then
  echo "FAILED: No iPhone Simulator found."
  exit 1
fi

echo "==> Simulator: $SIM_NAME"
echo "==> Log: $LOG_FILE"
echo "==> DerivedData: $DERIVED_DATA"
echo ""

: > "$LOG_FILE"

echo "==> Resolving packages..."
if ! xcodebuild -project App.xcodeproj -scheme App -derivedDataPath "$DERIVED_DATA" -resolvePackageDependencies 2>&1 | tee -a "$LOG_FILE"; then
  echo "FAILED: package resolution"
  exit 1
fi

echo "==> Building (lite — usually 5–15 min)..."
set +e
xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -derivedDataPath "$DERIVED_DATA" \
  -destination "platform=iOS Simulator,name=${SIM_NAME}" \
  build 2>&1 | tee -a "$LOG_FILE"
BUILD_EXIT=${PIPESTATUS[0]}
set -e

echo ""
if [ "$BUILD_EXIT" -eq 0 ] && grep -q "BUILD SUCCEEDED" "$LOG_FILE"; then
  APP_PATH="$(find "$DERIVED_DATA" -name "App.app" -path "*Debug-iphonesimulator*" -print -quit 2>/dev/null || true)"
  echo "========================================"
  echo "  BUILD SUCCEEDED (lite)"
  echo "========================================"
  [ -n "$APP_PATH" ] && echo "App: $APP_PATH"
  echo ""
  echo "Open Simulator app, then run:"
  echo "  xcrun simctl install booted \"$APP_PATH\""
  echo "  xcrun simctl launch booted com.velbok.app"
  echo ""
  echo "Or: npm run cap:ios → select $SIM_NAME → Run"
  exit 0
fi

echo "========================================"
echo "  BUILD FAILED (lite)"
echo "========================================"
grep -E "error:|fatal error:|BUILD FAILED" "$LOG_FILE" | tail -20 || tail -20 "$LOG_FILE"
exit 1

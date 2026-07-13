#!/usr/bin/env bash
# Check whether the last iOS simulator build produced an app bundle.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="${ROOT}/ios-build-simulator.log"

echo "==> Build log: $LOG_FILE"
if [ -f "$LOG_FILE" ]; then
  if grep -q "BUILD SUCCEEDED" "$LOG_FILE"; then
    echo "Status: BUILD SUCCEEDED (in log)"
  elif grep -q "BUILD FAILED" "$LOG_FILE"; then
    echo "Status: BUILD FAILED (in log)"
    echo ""
    echo "Last errors:"
    grep -E "error:|fatal error:" "$LOG_FILE" | tail -15
  else
    echo "Status: UNKNOWN — log has no BUILD SUCCEEDED / BUILD FAILED"
    echo "The build may still be running, was interrupted, or stopped early."
  fi
else
  echo "Status: No log file yet. Run: npm run ios:build-simulator"
fi

echo ""
APP_PATH="$(find ~/Library/Developer/Xcode/DerivedData -name "App.app" -path "*Debug-iphonesimulator*" -print -quit 2>/dev/null || true)"
if [ -n "$APP_PATH" ]; then
  echo "Found simulator app: $APP_PATH"
else
  echo "No Debug simulator App.app found in DerivedData yet."
fi

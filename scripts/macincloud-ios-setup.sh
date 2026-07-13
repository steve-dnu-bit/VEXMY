#!/usr/bin/env bash
# One-shot MacinCloud/Xcode reset + pull latest iOS build fixes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Pulling latest apple-app-store branch..."
git fetch origin apple-app-store
git checkout apple-app-store
git pull origin apple-app-store

echo "==> Installing npm dependencies..."
npm install

echo "==> Clearing stale provisioning profiles..."
rm -rf ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*

# MacinCloud sometimes splits /Users and /Volumes/Macintosh_HD paths.
VOL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles"
USER_PROFILES="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
if [[ ! -e "$VOL_PROFILES" && -d "$(dirname "$VOL_PROFILES")" ]]; then
  echo "==> Linking provisioning profile folders for MacinCloud..."
  ln -sf "$USER_PROFILES" "$VOL_PROFILES"
fi

echo "==> Resetting Xcode signing cache for this project..."
npm run ios:reset-signing

echo ""
echo "Done. Next:"
echo "  npm run ios:build-simulator"
echo ""
echo "When that succeeds:"
echo "  npm run cap:ios"

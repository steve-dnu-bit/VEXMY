#!/usr/bin/env bash
# Build and export an App Store IPA. Requires macOS, Xcode, and valid signing.
#
# Optional:
#   SKIP_UPLOAD=1          — archive only, no App Store Connect upload
#   SKIP_NPM_INSTALL=1     — skip npm ci (if node_modules already present)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VELBOK_ROOT="$ROOT"
# shellcheck source=scripts/ios-archive-lib.sh
source "$ROOT/scripts/ios-archive-lib.sh"

if [[ ! -f "ios/App/App/GoogleService-Info.plist" ]]; then
  echo "Warning: ios/App/App/GoogleService-Info.plist is missing."
  echo "Push notifications will not work until you add it from Firebase Console."
  echo "See docs/app-store-release.md and docs/mobile-push-setup.md"
  if [[ -z "${SKIP_FIREBASE_CHECK:-}" ]]; then
    read -r -p "Continue without Firebase plist? [y/N] " ans
    [[ "${ans:-}" =~ ^[Yy]$ ]] || exit 1
  fi
fi

BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")"
HEAD_SHORT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "?")"
echo "==> git branch=$BRANCH HEAD=$HEAD_SHORT"
if [[ "$BRANCH" != "apple-app-store" ]]; then
  echo "WARNING: not on apple-app-store (currently $BRANCH)."
  echo "         main / other branches often have older MARKETING_VERSION."
  echo "         Prefer: git fetch origin && git checkout apple-app-store && git reset --hard origin/apple-app-store"
fi

if [[ -z "${SKIP_NPM_INSTALL:-}" ]]; then
  echo "==> Installing npm dependencies"
  npm ci
fi

npm run ios:prepare

EXPECTED_VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/mobile-version.json','utf8')).versionName)")"
EXPECTED_BUILD="$(node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/mobile-version.json','utf8')).versionCode)")"
echo "==> Version gate after ios:prepare"
if ! node "$ROOT/scripts/verify-mobile-version.mjs"; then
  echo "ERROR: version mismatch — refusing to archive."
  exit 1
fi

ARCHIVE_DIR="$ROOT/releases/app-versions/ios"
ARCHIVE_PATH="$ARCHIVE_DIR/Velbok.xcarchive"
EXPORT_PATH="$ARCHIVE_DIR/export"
mkdir -p "$ARCHIVE_DIR"
rm -rf "$ARCHIVE_PATH"

cd ios/App

TEAM_ID="${DEVELOPMENT_TEAM:-NS8FATRNW3}"
REAL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles.real"
VOL_PROFILES="/Volumes/Macintosh_HD/Users/$(whoami)/Library/Developer/Xcode/UserData/Provisioning Profiles"
USER_PROFILES="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"

if [[ -L "$VOL_PROFILES" ]] && [[ "$(readlink "$VOL_PROFILES")" == "$(readlink "$USER_PROFILES" 2>/dev/null || echo "")" ]]; then
  : # already fixed
elif [[ ! -d "$REAL_PROFILES" ]]; then
  bash "$ROOT/scripts/ios-fix-provisioning-folder.sh"
fi
mkdir -p "$REAL_PROFILES"
chmod -R u+rwx "$(dirname "$REAL_PROFILES")" 2>/dev/null || true

echo "Archiving Velbok (Release) $EXPECTED_VERSION ($EXPECTED_BUILD) with team $TEAM_ID and profile 'Velbok App Store'..."
xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Manual \
  PROVISIONING_PROFILE_SPECIFIER=f4346d1d-7aa3-4729-907f-2df189f33e29 \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  MARKETING_VERSION="$EXPECTED_VERSION" \
  CURRENT_PROJECT_VERSION="$EXPECTED_BUILD" \
  clean archive

INFO_PLIST="$ARCHIVE_PATH/Products/Applications/App.app/Info.plist"
ARCHIVED_VERSION="?"
ARCHIVED_BUILD="?"
if [[ -f "$INFO_PLIST" ]]; then
  ARCHIVED_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$INFO_PLIST" 2>/dev/null || echo "?")"
  ARCHIVED_BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$INFO_PLIST" 2>/dev/null || echo "?")"
fi
echo "==> Archived Info.plist: CFBundleShortVersionString=$ARCHIVED_VERSION CFBundleVersion=$ARCHIVED_BUILD"
if [[ "$ARCHIVED_VERSION" != "$EXPECTED_VERSION" || "$ARCHIVED_BUILD" != "$EXPECTED_BUILD" ]]; then
  echo "ERROR: archive stamped $ARCHIVED_VERSION ($ARCHIVED_BUILD), expected $EXPECTED_VERSION ($EXPECTED_BUILD)"
  echo "       Clean DerivedData and rebuild. Do not upload this archive."
  exit 1
fi

if [[ -n "${SKIP_UPLOAD:-}" ]]; then
  echo "==> SKIP_UPLOAD set — exporting IPA locally only"
fi

echo "Exporting for App Store Connect..."
rm -rf "$EXPORT_PATH"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$ROOT/ios/ExportOptions.plist" \
  -allowProvisioningUpdates

IPA_PATH="$EXPORT_PATH/App.ipa"
IPA_VERSION="?"
IPA_BUILD="?"
if [[ -f "$IPA_PATH" ]]; then
  IPA_WORK="$(mktemp -d)"
  if unzip -q -o "$IPA_PATH" -d "$IPA_WORK" 2>/dev/null; then
    IPA_PLIST="$(find "$IPA_WORK/Payload" -maxdepth 2 -name Info.plist -print -quit)"
    if [[ -n "$IPA_PLIST" ]]; then
      IPA_VERSION="$(velbok_plist_get "$IPA_PLIST" CFBundleShortVersionString)"
      IPA_BUILD="$(velbok_plist_get "$IPA_PLIST" CFBundleVersion)"
    fi
  fi
  rm -rf "$IPA_WORK"
  if [[ "$IPA_VERSION" != "$EXPECTED_VERSION" || "$IPA_BUILD" != "$EXPECTED_BUILD" ]]; then
    echo "ERROR: exported IPA is $IPA_VERSION ($IPA_BUILD), expected $EXPECTED_VERSION ($EXPECTED_BUILD)."
    echo "       Check manageAppVersionAndBuildNumber in ios/ExportOptions.plist. Do not upload."
    exit 1
  fi
fi

ORGANIZER_LATEST="$(velbok_newest_organizer_archive)"

echo ""
echo "########################################################################"
echo "#                                                                      #"
echo "#   ARCHIVE BUILT AND VERIFIED:  $EXPECTED_VERSION ($EXPECTED_BUILD)"
echo "#                                                                      #"
echo "########################################################################"
echo "#"
echo "#  .xcarchive : $ARCHIVE_PATH"
echo "#  .ipa       : $IPA_PATH"
echo "#  stamped    : CFBundleShortVersionString=$ARCHIVED_VERSION CFBundleVersion=$ARCHIVED_BUILD"
echo "#  ipa stamped: CFBundleShortVersionString=$IPA_VERSION CFBundleVersion=$IPA_BUILD"
echo "#"
echo "########################################################################"
echo "#  READ THIS — XCODE ORGANIZER WILL NOT SHOW THE ARCHIVE ABOVE.        #"
echo "########################################################################"
echo "#"
echo "#  Organizer only lists archives under:"
echo "#    ~/Library/Developer/Xcode/Archives/"
echo "#  This script deliberately writes into the repo instead, so the archive"
echo "#  is reproducible and version-gated. If you open Organizer now you will"
echo "#  see a DIFFERENT, OLDER archive and you will ship the wrong version."
if [[ -n "$ORGANIZER_LATEST" ]]; then
  ORG_PLIST="$ORGANIZER_LATEST/Products/Applications/App.app/Info.plist"
  ORG_VERSION="$(velbok_plist_get "$ORG_PLIST" CFBundleShortVersionString)"
  ORG_BUILD="$(velbok_plist_get "$ORG_PLIST" CFBundleVersion)"
  echo "#"
  echo "#  Newest archive Organizer WILL show you (ignore it):"
  echo "#    $ORGANIZER_LATEST"
  echo "#    stamped $ORG_VERSION ($ORG_BUILD)"
  if [[ "$ORG_VERSION" != "$EXPECTED_VERSION" || "$ORG_BUILD" != "$EXPECTED_BUILD" ]]; then
    echo "#    ^^^ THIS IS THE WRONG VERSION. Delete it:"
    echo "#        rm -rf ~/Library/Developer/Xcode/Archives/*"
  fi
fi
echo "#"
echo "#  To ship, upload the IPA above with Transporter:"
echo "#    open -a Transporter"
echo "#    drag $IPA_PATH  ->  Deliver"
echo "#"
echo "#  To re-verify at any time:"
echo "#    bash scripts/ios-verify-archive.sh"
echo "#"
echo "########################################################################"
echo "Enable 'Upload your app's symbols' if prompted — dSYMs help crash reports."

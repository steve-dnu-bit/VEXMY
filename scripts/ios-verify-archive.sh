#!/usr/bin/env bash
# Print the version actually baked into every iOS build artifact on this Mac.
#
# Source files are checked by `npm run verify:version`. This script checks the
# opposite end of the pipeline: the archives and IPAs that really get uploaded.
# When source says one version and "the archive" says another, the answer is
# almost always that two different archives exist and the wrong one is open.
#
#   bash scripts/ios-verify-archive.sh                        # everything it can find
#   bash scripts/ios-verify-archive.sh /path/to/App.xcarchive # one specific archive
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VELBOK_ROOT="$ROOT"
# shellcheck source=scripts/ios-archive-lib.sh
source "$ROOT/scripts/ios-archive-lib.sh"

EXPECTED_VERSION="$(velbok_expected_version)"
EXPECTED_BUILD="$(velbok_expected_build)"

echo "expected (scripts/mobile-version.json): $EXPECTED_VERSION ($EXPECTED_BUILD)"
echo ""

verdict() {
  if [[ "$1" == "$EXPECTED_VERSION" && "$2" == "$EXPECTED_BUILD" ]]; then
    echo "MATCH"
  else
    echo "MISMATCH  <-- do not upload"
  fi
}

report_archive() {
  local label="$1" archive="$2"
  local plist version build
  plist="$(velbok_archive_app_plist "$archive")"
  echo "$label"
  echo "  path: $archive"
  if [[ ! -f "$plist" ]]; then
    echo "  (no App.app inside)"
    echo ""
    return
  fi
  version="$(velbok_plist_get "$plist" CFBundleShortVersionString)"
  build="$(velbok_plist_get "$plist" CFBundleVersion)"
  echo "  App.app: $version ($build)   $(verdict "$version" "$build")"
  echo ""
}

report_ipa() {
  local label="$1" ipa="$2"
  local work plist version build
  echo "$label"
  echo "  path: $ipa"
  work="$(mktemp -d)"
  if unzip -q -o "$ipa" -d "$work" 2>/dev/null; then
    plist="$(find "$work/Payload" -maxdepth 2 -name Info.plist -print -quit)"
    if [[ -n "$plist" ]]; then
      version="$(velbok_plist_get "$plist" CFBundleShortVersionString)"
      build="$(velbok_plist_get "$plist" CFBundleVersion)"
      echo "  Payload/*.app: $version ($build)   $(verdict "$version" "$build")"
    else
      echo "  (no Info.plist in Payload)"
    fi
  else
    echo "  (could not unzip)"
  fi
  rm -rf "$work"
  echo ""
}

if [[ -n "${1:-}" ]]; then
  report_archive "EXPLICIT ARCHIVE" "$1"
  exit 0
fi

REPO_ARCHIVE="$(velbok_repo_archive)"
if [[ -d "$REPO_ARCHIVE" ]]; then
  report_archive "REPO ARCHIVE (built by npm run ios:archive — Organizer does NOT list this)" "$REPO_ARCHIVE"
else
  echo "REPO ARCHIVE: none at $REPO_ARCHIVE (run npm run ios:archive)"
  echo ""
fi

REPO_IPA="$ROOT/releases/app-versions/ios/export/App.ipa"
if [[ -f "$REPO_IPA" ]]; then
  report_ipa "EXPORTED IPA (this is what you upload to Transporter)" "$REPO_IPA"
fi

echo "XCODE ORGANIZER ARCHIVES (~/Library/Developer/Xcode/Archives)"
FOUND=0
while IFS= read -r archive; do
  [[ -z "$archive" ]] && continue
  FOUND=1
  report_archive "  organizer archive" "$archive"
done < <(ls -td "$HOME"/Library/Developer/Xcode/Archives/*/*.xcarchive 2>/dev/null)
if [[ "$FOUND" -eq 0 ]]; then
  echo "  none"
  echo ""
else
  echo "  Any MISMATCH above is a stale GUI archive. Purge them with:"
  echo "    rm -rf ~/Library/Developer/Xcode/Archives/*"
  echo ""
fi

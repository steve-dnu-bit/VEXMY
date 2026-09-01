#!/usr/bin/env bash
# Shared helpers for locating and version-checking iOS archives.
#
# Two archive locations exist on a Mac and they are easy to confuse:
#
#   1. releases/app-versions/ios/Velbok.xcarchive  — written by scripts/ios-archive.sh.
#      Xcode Organizer NEVER lists this one, because Organizer only reads location 2.
#   2. ~/Library/Developer/Xcode/Archives/<date>/*.xcarchive — written by Xcode's
#      GUI Product > Archive. This is what Organizer shows.
#
# Shipping the wrong version has happened by exporting location 2 (an old GUI
# archive) after building location 1. Everything here prefers the repo archive
# and refuses to proceed when the stamped version disagrees with
# scripts/mobile-version.json.

# shellcheck disable=SC2034

velbok_repo_archive() {
  echo "$VELBOK_ROOT/releases/app-versions/ios/Velbok.xcarchive"
}

velbok_newest_organizer_archive() {
  ls -td "$HOME"/Library/Developer/Xcode/Archives/*/*.xcarchive 2>/dev/null | head -1 || true
}

velbok_expected_version() {
  VELBOK_VERSION_FILE="$VELBOK_ROOT/scripts/mobile-version.json" \
    node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.VELBOK_VERSION_FILE,'utf8')).versionName)"
}

velbok_expected_build() {
  VELBOK_VERSION_FILE="$VELBOK_ROOT/scripts/mobile-version.json" \
    node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.VELBOK_VERSION_FILE,'utf8')).versionCode)"
}

# velbok_plist_get <plist> <key>
velbok_plist_get() {
  /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || echo "?"
}

# velbok_archive_app_plist <archive> — path to the Info.plist actually shipped in the app
velbok_archive_app_plist() {
  echo "$1/Products/Applications/App.app/Info.plist"
}

# velbok_describe_archive <archive> — prints the versions Organizer and the App Store will see
velbok_describe_archive() {
  local archive="$1"
  local app_plist archive_plist
  app_plist="$(velbok_archive_app_plist "$archive")"
  archive_plist="$archive/Info.plist"

  echo "  archive:            $archive"
  if [[ -f "$archive_plist" ]]; then
    echo "  .xcarchive Info:    $(velbok_plist_get "$archive_plist" 'ApplicationProperties:CFBundleShortVersionString') ($(velbok_plist_get "$archive_plist" 'ApplicationProperties:CFBundleVersion'))"
  fi
  if [[ -f "$app_plist" ]]; then
    echo "  App.app Info:       $(velbok_plist_get "$app_plist" CFBundleShortVersionString) ($(velbok_plist_get "$app_plist" CFBundleVersion))"
  else
    echo "  App.app Info:       MISSING ($app_plist)"
  fi
}

# velbok_assert_archive_version <archive> — hard-fail unless the app bundle matches mobile-version.json
velbok_assert_archive_version() {
  local archive="$1"
  local expected_version expected_build app_plist actual_version actual_build
  expected_version="$(velbok_expected_version)"
  expected_build="$(velbok_expected_build)"
  app_plist="$(velbok_archive_app_plist "$archive")"

  if [[ ! -f "$app_plist" ]]; then
    echo "ERROR: no app bundle inside archive: $archive" >&2
    return 1
  fi

  actual_version="$(velbok_plist_get "$app_plist" CFBundleShortVersionString)"
  actual_build="$(velbok_plist_get "$app_plist" CFBundleVersion)"

  if [[ "$actual_version" != "$expected_version" || "$actual_build" != "$expected_build" ]]; then
    echo "" >&2
    echo "########################################################################" >&2
    echo "  WRONG VERSION IN ARCHIVE — REFUSING TO CONTINUE" >&2
    echo "########################################################################" >&2
    echo "  archive:  $archive" >&2
    echo "  stamped:  $actual_version ($actual_build)" >&2
    echo "  expected: $expected_version ($expected_build)   <- scripts/mobile-version.json" >&2
    echo "" >&2
    echo "  This is almost always a STALE archive, not a source problem." >&2
    echo "  Source is verified separately by: npm run verify:version" >&2
    echo "" >&2
    echo "  Fix:" >&2
    echo "    rm -rf ~/Library/Developer/Xcode/DerivedData/*" >&2
    echo "    rm -rf ~/Library/Developer/Xcode/Archives/*" >&2
    echo "    npm run ios:archive" >&2
    echo "########################################################################" >&2
    return 1
  fi

  echo "==> Archive version OK: $actual_version ($actual_build)"
  return 0
}

# velbok_pick_archive <explicit-path-or-empty>
# Prefers an explicit path, then the repo archive, then the newest Organizer archive.
# Writes the chosen path to stdout; all commentary goes to stderr.
velbok_pick_archive() {
  local explicit="${1:-}"
  local repo_archive organizer_archive
  repo_archive="$(velbok_repo_archive)"
  organizer_archive="$(velbok_newest_organizer_archive)"

  if [[ -n "$explicit" ]]; then
    echo "$explicit"
    return 0
  fi

  if [[ -d "$repo_archive" ]]; then
    if [[ -n "$organizer_archive" ]]; then
      echo "Note: ignoring newest Xcode Organizer archive in favour of the repo archive." >&2
      echo "      Organizer archive: $organizer_archive" >&2
      echo "      Pass it explicitly if you really want it." >&2
    fi
    echo "$repo_archive"
    return 0
  fi

  if [[ -n "$organizer_archive" ]]; then
    echo "WARNING: no repo archive at $repo_archive" >&2
    echo "         Falling back to the newest Xcode Organizer archive, which may be OLD:" >&2
    echo "         $organizer_archive" >&2
    echo "         Run 'npm run ios:archive' first to build a fresh, version-checked archive." >&2
    echo "$organizer_archive"
    return 0
  fi

  return 1
}

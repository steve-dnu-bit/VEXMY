# Clean install Velbok release APK (required for Stripe Tap to Pay).
# Uninstalls any debug build first, then installs signed release.
param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseApk = Join-Path $repoRoot "android\app\build\outputs\apk\release\app-release.apk"
$releasesApk = Join-Path $repoRoot "releases\velbok-release.apk"

function Find-Adb {
  $candidates = @(
    "$env:ANDROID_HOME\platform-tools\adb.exe",
    "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe",
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
  )
  foreach ($path in $candidates) {
    if ($path -and (Test-Path $path)) { return $path }
  }
  $adbCmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($adbCmd) { return $adbCmd.Source }
  throw "adb not found. Set ANDROID_HOME or install Android SDK Platform-Tools."
}

if (-not $SkipBuild) {
  Write-Host "Building release APK..."
  Push-Location $repoRoot
  $env:JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "F:\New folder\jbr" }
  $env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "F:\Android\Sdk" }
  node scripts/patch-stripe-terminal-android.mjs
  npm run cap:sync
  Push-Location (Join-Path $repoRoot "android")
  .\gradlew.bat assembleRelease
  Pop-Location
  Pop-Location
}

if (-not (Test-Path $releaseApk)) {
  throw "Release APK not found at $releaseApk"
}

New-Item -ItemType Directory -Force -Path (Split-Path $releasesApk) | Out-Null
Copy-Item $releaseApk $releasesApk -Force
Write-Host "Copied to $releasesApk"

$aapt = @(
  "$env:ANDROID_HOME\build-tools\*\aapt.exe",
  "$env:LOCALAPPDATA\Android\Sdk\build-tools\*\aapt.exe"
) | ForEach-Object { Get-Item $_ -ErrorAction SilentlyContinue } | Sort-Object FullName -Descending | Select-Object -First 1

if ($aapt) {
  $badging = & $aapt.FullName dump badging $releaseApk 2>&1 | Select-String "debuggable|versionCode|versionName"
  Write-Host "APK verification:"
  $badging | ForEach-Object { Write-Host "  $_" }
}

$adb = Find-Adb
Write-Host ""
Write-Host "Devices:"
& $adb devices -l

$serial = (& $adb devices | Select-String "device$" | ForEach-Object { ($_ -split "\s+")[0] } | Select-Object -First 1)
if (-not $serial) {
  Write-Host ""
  Write-Host "No USB device - copy this file to your phone and install manually:"
  Write-Host "  $releasesApk"
  Write-Host "Uninstall the old Velbok first if Android says signature conflict."
  exit 0
}

Write-Host ""
Write-Host "Uninstalling old Velbok (removes debug builds)..."
& $adb uninstall com.velbok.app 2>&1 | Out-Null

Write-Host "Installing release APK..."
& $adb install $releaseApk
Write-Host "Done. Turn Developer options OFF, restart phone, open Velbok POS."

# Pull Velbok / Stripe Tap to Pay crash from a connected Android device.
# Usage: plug in phone (USB debugging ON), reproduce crash, then run this script.
$ErrorActionPreference = "Continue"
$adb = if ($env:ANDROID_HOME) { Join-Path $env:ANDROID_HOME "platform-tools\adb.exe" } else { "adb" }
$outDir = Join-Path $PSScriptRoot "..\logs"
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$outFile = Join-Path $outDir "velbok-crash-$timestamp.log"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "Checking for Android device..."
& $adb devices -l
$serial = (& $adb devices | Select-String "device$" | ForEach-Object { ($_ -split "\s+")[0] } | Select-Object -First 1)

if (-not $serial) {
    Write-Host ""
    Write-Host "No device found. On your phone:"
    Write-Host "  1. Settings -> Developer options -> USB debugging ON"
    Write-Host "  2. Connect USB cable, tap Allow on the phone"
    Write-Host "  3. Run this script again after reproducing the crash"
    exit 1
}

Write-Host "Device: $serial"
Write-Host "Dumping recent crash / fatal logs to $outFile ..."

$filter = @(
    "adb logcat -d -b crash",
    "adb logcat -d *:E",
    "adb logcat -d | findstr /i `"velbok FATAL AndroidRuntime stripe terminal stripeterminal com.velbok`""
) -join "`n"

# Full dump: crash buffer + errors + filtered main log (last ~8000 lines)
& $adb logcat -d -b crash 2>&1 | Out-File -FilePath $outFile -Encoding utf8
"`n========== ERRORS (logcat *:E, last 500 lines) ==========`n" | Add-Content $outFile
& $adb logcat -d -t 500 *:E 2>&1 | Add-Content $outFile
"`n========== FILTERED (velbok / stripe / fatal) ==========`n" | Add-Content $outFile
& $adb logcat -d -t 3000 2>&1 | Select-String -Pattern "velbok|FATAL|AndroidRuntime|stripeterminal|StripeTerminal|com\.velbok|TerminalException" -CaseSensitive:$false | Add-Content $outFile

Write-Host "Saved: $outFile"
Write-Host ""
Write-Host "Last fatal block:"
Get-Content $outFile | Select-String -Pattern "FATAL EXCEPTION|Process: com.velbok|Caused by:" -Context 0,8 | Select-Object -Last 30

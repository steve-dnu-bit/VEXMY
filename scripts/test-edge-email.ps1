# Send a test email via Edge Functions (same path as booking emails). Shows Resend errors in output.
# Usage: .\scripts\test-edge-email.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$projectUrl = "https://tkremoxfkgoiuwghtzwd.supabase.co"
$envFile = Get-Content .env -Raw
if ($envFile -match 'VITE_SUPABASE_PUBLISHABLE_KEY=(\S+)') { $anonKey = $Matches[1].Trim() } else {
    Write-Host "Missing VITE_SUPABASE_PUBLISHABLE_KEY in .env" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Edge email delivery test (Resend) ===" -ForegroundColor Cyan
Write-Host "Uses CRON_SECRET (same as booking DB trigger)." -ForegroundColor Gray
Write-Host ""

$cronSecret = Read-Host "Paste CRON_SECRET (Edge Functions secret)"
$to = Read-Host "Send test to email"
$fromKind = Read-Host "fromKind: booking or notification [booking]"

if (-not $fromKind) { $fromKind = "booking" }

$body = (@{ to = $to.Trim(); fromKind = $fromKind } | ConvertTo-Json)
$headers = @{
    apikey         = $anonKey
    Authorization  = "Bearer $cronSecret"
    "x-cron-secret" = $cronSecret
    "Content-Type" = "application/json"
}

try {
    $result = Invoke-RestMethod -Uri "$projectUrl/functions/v1/email-delivery-test" -Method Post -Headers $headers -Body $body
    Write-Host ""
    Write-Host ($result | ConvertTo-Json -Depth 5) -ForegroundColor Green
    Write-Host ""
    Write-Host "Check https://resend.com/emails" -ForegroundColor Cyan
} catch {
    Write-Host "Request failed:" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    } else {
        Write-Host $_.Exception.Message
    }
    Write-Host ""
    Write-Host "401 = wrong CRON_SECRET. 503 = missing RESEND_API_KEY. 500 = Resend rejected From/API key." -ForegroundColor Yellow
}

Start-Process "https://resend.com/emails"

# One-shot: create Resend inbound webhook + store RESEND_WEBHOOK_SECRET in Supabase.
# Uses RESEND_API_KEY already in Edge secrets (via bootstrap-resend-webhook function).
# Usage: .\scripts\setup-inbound-webhook.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$projectRef = "tkremoxfkgoiuwghtzwd"
$functionUrl = "https://$projectRef.supabase.co/functions/v1/bootstrap-resend-webhook"

Write-Host ""
Write-Host "=== Velbok inbound webhook setup ===" -ForegroundColor Cyan
Write-Host ""

$bootstrapKey = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })

Write-Host "1. Setting temporary BOOTSTRAP_WEBHOOK_KEY..." -ForegroundColor Yellow
npx supabase secrets set "BOOTSTRAP_WEBHOOK_KEY=$bootstrapKey" --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "2. Deploying bootstrap-resend-webhook..." -ForegroundColor Yellow
npx supabase functions deploy bootstrap-resend-webhook --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "3. Waiting for secrets + deploy to propagate..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

Write-Host "4. Creating Resend webhook (email.received -> resend-inbound)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Method POST -Uri $functionUrl -Headers @{
        "x-bootstrap-key" = $bootstrapKey
        "Content-Type"    = "application/json"
    } -Body "{}" -ContentType "application/json"
} catch {
    $body = $_.ErrorDetails.Message
    Write-Host "Bootstrap failed: $body" -ForegroundColor Red
    exit 1
}

if (-not $response.signing_secret) {
    Write-Host "No signing_secret in response: $($response | ConvertTo-Json -Depth 5)" -ForegroundColor Red
    exit 1
}

$whsec = $response.signing_secret.Trim()
Write-Host "   Webhook ID: $($response.webhook_id)" -ForegroundColor Gray

Write-Host "5. Saving RESEND_WEBHOOK_SECRET..." -ForegroundColor Yellow
npx supabase secrets set "RESEND_WEBHOOK_SECRET=$whsec" --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "6. Removing temporary BOOTSTRAP_WEBHOOK_KEY..." -ForegroundColor Yellow
npx supabase secrets unset BOOTSTRAP_WEBHOOK_KEY --project-ref $projectRef 2>$null

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Resend webhook: $($response.endpoint)" -ForegroundColor White
Write-Host "Events: email.received" -ForegroundColor White
Write-Host ""
Write-Host "Still required outside Supabase:" -ForegroundColor Yellow
Write-Host "  - Namecheap: MX on @ for velbok.com (Receiving enabled in Resend)" -ForegroundColor White
Write-Host "  - Test: send mail to bookings@velbok.com" -ForegroundColor White
Write-Host ""

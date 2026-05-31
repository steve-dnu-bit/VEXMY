# Booking confirmation emails — Edge Function secrets + CRON_SECRET (matches DB trigger).
# Password reset uses Auth SMTP only; this script does NOT change that.
# Usage: .\scripts\setup-booking-email.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$projectRef = "tkremoxfkgoiuwghtzwd"

Write-Host ""
Write-Host "=== Velbok booking email setup ===" -ForegroundColor Cyan
Write-Host "Booking emails use Edge Functions (not Auth SMTP)." -ForegroundColor Gray
Write-Host ""

Write-Host "Step 1: Supabase login..." -ForegroundColor Yellow
npx supabase login
if ($LASTEXITCODE -ne 0) { exit 1 }
npx supabase link --project-ref $projectRef 2>$null

Write-Host ""
Write-Host "Step 2: Resend API key (same key as Auth SMTP)..." -ForegroundColor Yellow
$key = (Read-Host "Paste Resend API key (re_...)").Trim()
if (-not $key.StartsWith("re_")) {
    Write-Host "Invalid key — must start with re_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 3: Edge Function secrets..." -ForegroundColor Yellow
npx supabase secrets set `
    SMTP_HOST=smtp.resend.com `
    SMTP_PORT=465 `
    SMTP_USER=resend `
    "SMTP_PASS=$key" `
    "RESEND_API_KEY=$key" `
    "EMAIL_FROM=Velbok <no-reply@velbok.com>" `
    "BOOKINGS_EMAIL_FROM=Velbok <no-reply@velbok.com>" `
    "NOTIFICATIONS_EMAIL_FROM=Velbok <no-reply@velbok.com>" `
    SHOP_SUPPORT_EMAIL=no-reply@velbok.com `
    SHOP_NAME=Velbok `
    SHOP_WEBSITE_URL=https://velbok.com `
    SITE_URL=https://velbok.com

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to set secrets. Run: npx supabase login" -ForegroundColor Red
    exit 1
}
Write-Host "Edge email secrets OK." -ForegroundColor Green

Write-Host ""
Write-Host "Step 4: CRON_SECRET (DB trigger -> booking-notifications)..." -ForegroundColor Yellow
$mode = Read-Host "Generate new CRON_SECRET? (Y/n — choose n only if vault already has cron_secret and you know the value)"
if ($mode -eq "n" -or $mode -eq "N") {
    $cronSecret = Read-Host "Paste existing cron_secret value (must match vault)"
} else {
    $cronSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
    npx supabase secrets set "CRON_SECRET=$cronSecret"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "CRON_SECRET edge secret failed." -ForegroundColor Red
        exit 1
    }
    Write-Host "CRON_SECRET set on Edge Functions." -ForegroundColor Green
    Write-Host ""
    Write-Host "Run ONE of these in Supabase SQL Editor:" -ForegroundColor Cyan
    Write-Host @"

-- If cron_secret does NOT exist yet:
SELECT vault.create_secret('$cronSecret', 'cron_secret', 'Cron auth for booking emails');

-- If cron_secret ALREADY exists (update to match Edge CRON_SECRET):
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'cron_secret' LIMIT 1),
  '$cronSecret'
);
"@ -ForegroundColor White
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "1. Complete the SQL above if you generated a new CRON_SECRET." -ForegroundColor White
Write-Host "2. Create a test booking with a valid client email on the schedule." -ForegroundColor White
Write-Host "3. Check Resend -> Emails and Supabase -> Edge Functions -> booking-notifications -> Logs." -ForegroundColor White
Write-Host ""
Start-Process "https://supabase.com/dashboard/project/$projectRef/settings/functions"
Start-Process "https://supabase.com/dashboard/project/$projectRef/functions/booking-notifications/logs"
Start-Process "https://resend.com/emails"

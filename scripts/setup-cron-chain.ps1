# Velbok cron chain: CRON_SECRET (Edge) + cron_secret (vault) + pg_cron jobs.
# Chain: pg_cron (every 15m) -> send-booking-reminders, send-aftercare-emails
#        booking INSERT/UPDATE -> booking-notifications (same secret)
# Usage: .\scripts\setup-cron-chain.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$projectRef = "tkremoxfkgoiuwghtzwd"

Write-Host ""
Write-Host "=== Velbok cron chain setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This configures:" -ForegroundColor Gray
Write-Host "  - Edge secret CRON_SECRET" -ForegroundColor Gray
Write-Host "  - Vault secret cron_secret (same value)" -ForegroundColor Gray
Write-Host "  - pg_cron every 15 min -> reminders + aftercare emails" -ForegroundColor Gray
Write-Host "  - (Booking save emails use the same secret via DB trigger)" -ForegroundColor Gray
Write-Host ""

Write-Host "Step 1: Supabase login..." -ForegroundColor Yellow
npx supabase login
if ($LASTEXITCODE -ne 0) { exit 1 }
npx supabase link --project-ref $projectRef 2>$null

Write-Host ""
$mode = Read-Host "Generate new CRON_SECRET? (Y/n)"
if ($mode -eq "n" -or $mode -eq "N") {
    $cronSecret = Read-Host "Paste existing CRON_SECRET / cron_secret value"
} else {
    $cronSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
}

$cronSecret = $cronSecret.Trim()
if ($cronSecret.Length -lt 16) {
    Write-Host "Secret too short — use at least 16 characters." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 2: Edge Function secret CRON_SECRET..." -ForegroundColor Yellow
npx supabase secrets set "CRON_SECRET=$cronSecret"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed. Run: npx supabase login" -ForegroundColor Red
    exit 1
}
Write-Host "CRON_SECRET saved on Edge Functions." -ForegroundColor Green

Write-Host ""
Write-Host "Step 3: Vault secret (SQL Editor)..." -ForegroundColor Yellow
Write-Host @"

-- Run in: https://supabase.com/dashboard/project/$projectRef/sql/new

-- If cron_secret does not exist:
SELECT vault.create_secret(
  '$cronSecret',
  'cron_secret',
  'Cron auth: pg_cron + booking-notifications'
);

-- If cron_secret already exists (update to match Edge CRON_SECRET):
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'cron_secret' LIMIT 1),
  '$cronSecret'
);

"@ -ForegroundColor White

$ranVault = Read-Host "Have you run the vault SQL above? (y/N)"
if ($ranVault -ne "y" -and $ranVault -ne "Y") {
    Write-Host "Run the SQL, then re-run this script or apply Step 4 manually." -ForegroundColor Yellow
    Start-Process "https://supabase.com/dashboard/project/$projectRef/sql/new"
    exit 0
}

Write-Host ""
Write-Host "Step 4: Apply migration + refresh cron jobs..." -ForegroundColor Yellow
npm run db:push
if ($LASTEXITCODE -ne 0) {
    Write-Host "db:push failed. Run manually in SQL Editor:" -ForegroundColor Yellow
    Write-Host "  SELECT * FROM public.refresh_cron_jobs();" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "Refreshing pg_cron jobs..." -ForegroundColor Yellow
npx supabase db query --linked "SELECT * FROM public.refresh_cron_jobs();" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Run in SQL Editor: SELECT * FROM public.refresh_cron_jobs();" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 5: Verify scheduled jobs..." -ForegroundColor Yellow
$verifySql = "SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'send-%' ORDER BY jobname;"
try {
    npx supabase db query --linked $verifySql 2>&1
} catch {
    Write-Host "Could not query cron.job from CLI — check in SQL Editor:" -ForegroundColor Yellow
    Write-Host "  $verifySql" -ForegroundColor White
}

Write-Host ""
Write-Host "=== Cron chain ready ===" -ForegroundColor Green
Write-Host "Every 15 min: send-booking-reminders, send-aftercare-emails" -ForegroundColor White
Write-Host "On booking save: booking-notifications (if email secrets are set)" -ForegroundColor White
Write-Host ""
Write-Host "Also set booking email secrets: .\scripts\setup-booking-email.ps1" -ForegroundColor Gray
Write-Host ""
Start-Process "https://supabase.com/dashboard/project/$projectRef/functions/send-booking-reminders/logs"
Start-Process "https://supabase.com/dashboard/project/$projectRef/database/cron-jobs"

# Velbok — configure ALL email from scratch (Auth password reset + booking + cron).
# Run in PowerShell:  .\scripts\setup-all-email-from-scratch.ps1
#
# You need:
#   - Resend account with velbok.com domain VERIFIED
#   - Resend API key (re_...)
#   - npx supabase login (browser opens once)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$projectRef = "tkremoxfkgoiuwghtzwd"
$siteUrl = "https://velbok.com"
$senderEmail = "no-reply@velbok.com"
$senderName = "Velbok"
$fromHeader = "$senderName <$senderEmail>"

function Get-SupabaseAccessToken {
    foreach ($p in @(
            "$env:USERPROFILE\.supabase\access-token",
            "$env:APPDATA\supabase\access-token",
            "$env:LOCALAPPDATA\supabase\access-token"
        )) {
        if (Test-Path $p) { return (Get-Content $p -Raw).Trim() }
    }
    if ($env:SUPABASE_ACCESS_TOKEN) { return $env:SUPABASE_ACCESS_TOKEN.Trim() }
    return $null
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Velbok email setup (from scratch)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This configures THREE separate systems:" -ForegroundColor White
Write-Host "  1. Auth SMTP      -> password reset (Supabase Authentication)" -ForegroundColor Gray
Write-Host "  2. Edge secrets   -> booking emails, reminders (Resend API)" -ForegroundColor Gray
Write-Host "  3. CRON + vault   -> automatic reminders every 15 min" -ForegroundColor Gray
Write-Host ""

# --- Prerequisites ---
Write-Host "Before continuing, confirm in Resend (resend.com):" -ForegroundColor Yellow
Write-Host "  [ ] Domain velbok.com is Verified (green)" -ForegroundColor Gray
Write-Host "  [ ] You have an API key starting with re_" -ForegroundColor Gray
Write-Host ""
$ready = Read-Host "Ready to continue? (y/N)"
if ($ready -ne "y" -and $ready -ne "Y") { exit 0 }

# --- Step 1: Login ---
Write-Host ""
Write-Host "STEP 1/6: Supabase CLI login..." -ForegroundColor Yellow
npx supabase login
if ($LASTEXITCODE -ne 0) { exit 1 }
npx supabase link --project-ref $projectRef 2>$null
Write-Host "  OK" -ForegroundColor Green

# --- Step 2: Resend key ---
Write-Host ""
Write-Host "STEP 2/6: Resend API key..." -ForegroundColor Yellow
$resendKey = (Read-Host "Paste Resend API key (re_...)").Trim()
if (-not $resendKey.StartsWith("re_")) {
    Write-Host "  Invalid — key must start with re_" -ForegroundColor Red
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

# --- Step 3: Edge secrets (booking + reminders) ---
Write-Host ""
Write-Host "STEP 3/6: Edge Function secrets (clears old values by setting fresh ones)..." -ForegroundColor Yellow

$cronSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })

npx supabase secrets set `
    SMTP_HOST=smtp.resend.com `
    SMTP_PORT=465 `
    SMTP_USER=resend `
    "SMTP_PASS=$resendKey" `
    "RESEND_API_KEY=$resendKey" `
    "EMAIL_FROM=$fromHeader" `
    "BOOKINGS_EMAIL_FROM=$fromHeader" `
    "NOTIFICATIONS_EMAIL_FROM=$fromHeader" `
    "SHOP_SUPPORT_EMAIL=$senderEmail" `
    SHOP_NAME=Velbok `
    "SHOP_WEBSITE_URL=$siteUrl" `
    "SITE_URL=$siteUrl" `
    "PLATFORM_NAME=Velbok" `
    "CRON_SECRET=$cronSecret"

if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAILED — set secrets manually:" -ForegroundColor Red
    Write-Host "  https://supabase.com/dashboard/project/$projectRef/settings/functions" -ForegroundColor Gray
    exit 1
}
Write-Host "  OK (including new CRON_SECRET)" -ForegroundColor Green

# --- Step 4: Vault (must match CRON_SECRET) ---
Write-Host ""
Write-Host "STEP 4/6: Database vault secret (required for booking save + cron)..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Open SQL Editor and run ONE of these:" -ForegroundColor Cyan
Write-Host "  https://supabase.com/dashboard/project/$projectRef/sql/new" -ForegroundColor Gray
Write-Host ""
$vaultSql = @"
-- Use UPDATE if cron_secret already exists (most projects):
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'cron_secret' LIMIT 1),
  '$cronSecret'
);

-- If update returns 0 rows / error, use CREATE instead:
-- SELECT vault.create_secret('$cronSecret', 'cron_secret', 'Velbok cron + booking emails');
"@
Write-Host $vaultSql -ForegroundColor White
Write-Host ""
$vaultDone = Read-Host "Have you run the vault SQL above? (y/N)"
if ($vaultDone -ne "y" -and $vaultDone -ne "Y") {
    Write-Host "Stop here — run the SQL, then re-run this script from STEP 5." -ForegroundColor Yellow
    Start-Process "https://supabase.com/dashboard/project/$projectRef/sql/new"
    exit 0
}

# --- Step 5: Auth SMTP (password reset) ---
Write-Host ""
Write-Host "STEP 5/6: Auth SMTP (password reset)..." -ForegroundColor Yellow
$token = Get-SupabaseAccessToken
if (-not $token) {
    Write-Host "  Paste a Supabase access token from:" -ForegroundColor Gray
    Write-Host "  https://supabase.com/dashboard/account/tokens" -ForegroundColor Gray
    $token = (Read-Host "Token (sbp_...)").Trim()
}

$authBody = @{
    external_email_enabled = $true
    smtp_host              = "smtp.resend.com"
    smtp_port              = 465
    smtp_user              = "resend"
    smtp_pass              = $resendKey
    smtp_admin_email       = $senderEmail
    smtp_sender_name       = $senderName
    smtp_max_frequency     = 120
    site_url               = $siteUrl
} | ConvertTo-Json

try {
    Invoke-RestMethod -Method Patch `
        -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" `
        -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
        -Body $authBody | Out-Null
    Write-Host "  OK — Auth SMTP configured" -ForegroundColor Green
} catch {
    Write-Host "  API failed — set manually:" -ForegroundColor Yellow
    Write-Host "  https://supabase.com/dashboard/project/$projectRef/auth/smtp" -ForegroundColor Gray
    Write-Host "  Host smtp.resend.com | Port 465 | User resend | Pass = re_ key" -ForegroundColor Gray
    Write-Host "  Sender: $senderEmail | Name: $senderName" -ForegroundColor Gray
    Start-Process "https://supabase.com/dashboard/project/$projectRef/auth/smtp"
}

Write-Host ""
Write-Host "  Auth URL config (confirm in dashboard):" -ForegroundColor Gray
Write-Host "  Site URL: $siteUrl | Redirects: $siteUrl/**" -ForegroundColor Gray

# --- Step 6: DB migration + cron + deploy ---
Write-Host ""
Write-Host "STEP 6/6: Database cron jobs + deploy functions..." -ForegroundColor Yellow
npm run db:push
if ($LASTEXITCODE -eq 0) {
    npx supabase db query --linked "SELECT * FROM public.refresh_cron_jobs();" 2>$null
    Write-Host "  Cron jobs refreshed" -ForegroundColor Green
} else {
    Write-Host "  db:push failed — run in SQL Editor: SELECT * FROM public.refresh_cron_jobs();" -ForegroundColor Yellow
}

Write-Host "  Deploying edge functions..." -ForegroundColor Gray
npx supabase functions deploy --project-ref $projectRef 2>&1 | Out-Null
Write-Host "  Functions deployed" -ForegroundColor Green

# --- Test ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TEST (required)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$testEmail = Read-Host "Your email for delivery test"
$envFile = Get-Content .env -Raw -ErrorAction SilentlyContinue
if ($envFile -match 'VITE_SUPABASE_PUBLISHABLE_KEY=(\S+)') { $anonKey = $Matches[1].Trim() }

$testBody = (@{ to = $testEmail.Trim(); fromKind = "booking" } | ConvertTo-Json)
$testHeaders = @{
    apikey          = $anonKey
    Authorization   = "Bearer $cronSecret"
    "x-cron-secret" = $cronSecret
    "Content-Type"  = "application/json"
}

Write-Host "Sending edge test email (booking path)..." -ForegroundColor Yellow
try {
    $testResult = Invoke-RestMethod `
        -Uri "https://$projectRef.supabase.co/functions/v1/email-delivery-test" `
        -Method Post -Headers $testHeaders -Body $testBody
    Write-Host ($testResult | ConvertTo-Json -Depth 4) -ForegroundColor Green
    if ($testResult.ok) {
        Write-Host ""
        Write-Host "SUCCESS — check Resend -> Emails and your inbox." -ForegroundColor Green
    }
} catch {
    Write-Host "TEST FAILED:" -ForegroundColor Red
    Write-Host $_.ErrorDetails.Message
    Write-Host ""
    Write-Host "Fix Edge secrets in dashboard, wait 60s, run: .\scripts\test-edge-email.ps1" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Save this CRON_SECRET somewhere safe (needed if you re-run vault SQL):" -ForegroundColor Gray
Write-Host "  $cronSecret" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Next: create a booking with client email on Schedule." -ForegroundColor Cyan
Write-Host ""
Start-Process "https://resend.com/emails"
Start-Process "https://supabase.com/dashboard/project/$projectRef/settings/functions"

# One-shot email setup — run in PowerShell on YOUR PC (I can't access your Resend/Supabase accounts from here).
# Double-click or:  .\scripts\setup-email-now.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$projectRef = "tkremoxfkgoiuwghtzwd"

Write-Host ""
Write-Host "=== VexMy email setup (about 2 minutes) ===" -ForegroundColor Cyan
Write-Host ""

function Get-SupabaseAccessToken {
    $paths = @(
        "$env:USERPROFILE\.supabase\access-token",
        "$env:APPDATA\supabase\access-token",
        "$env:LOCALAPPDATA\supabase\access-token"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) {
            return (Get-Content $p -Raw).Trim()
        }
    }
    return $null
}

# --- Step 1: Supabase login ---
Write-Host "Step 1/4: Supabase login (browser opens — click Authorize)..." -ForegroundColor Yellow
npx supabase login
if ($LASTEXITCODE -ne 0) { exit 1 }

npx supabase link --project-ref $projectRef 2>$null

# --- Step 2: Resend API key ---
Write-Host ""
Write-Host "Step 2/4: Resend API key" -ForegroundColor Yellow
Write-Host "Open https://resend.com/api-keys and copy a key that starts with re_" -ForegroundColor Gray
$key = Read-Host "Paste Resend API key here"
$key = $key.Trim()
if (-not $key.StartsWith("re_")) {
    Write-Host "Invalid key — must start with re_" -ForegroundColor Red
    exit 1
}

# --- Step 3: Edge function secrets ---
Write-Host ""
Write-Host "Step 3/4: Saving edge function secrets..." -ForegroundColor Yellow
npx supabase secrets set `
    SMTP_HOST=smtp.resend.com `
    SMTP_PORT=465 `
    SMTP_USER=resend `
    "SMTP_PASS=$key" `
    "EMAIL_FROM=VexMy <no-reply@vexmy.com>" `
    SITE_URL=https://vexmy.com `
    SHOP_SUPPORT_EMAIL=no-reply@vexmy.com `
    SHOP_NAME=VexMy `
    SHOP_WEBSITE_URL=https://vexmy.com `
    "RESEND_API_KEY=$key"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Secrets failed. Try: npx supabase login" -ForegroundColor Red
    exit 1
}
Write-Host "Edge secrets OK." -ForegroundColor Green

# --- Step 4: Auth SMTP (password reset) via Management API ---
Write-Host ""
Write-Host "Step 4/4: Configuring Auth SMTP (password reset emails)..." -ForegroundColor Yellow

$token = Get-SupabaseAccessToken
if (-not $token) {
    Write-Host "Could not read Supabase token automatically." -ForegroundColor Yellow
    Write-Host "Get one from: https://supabase.com/dashboard/account/tokens" -ForegroundColor Gray
    $token = Read-Host "Paste Supabase access token (sbp_...)"
}

$authBody = @{
    external_email_enabled               = $true
    smtp_host                            = "smtp.resend.com"
    smtp_port                            = "465"
    smtp_user                            = "resend"
    smtp_pass                            = $key
    smtp_admin_email                     = "no-reply@vexmy.com"
    smtp_sender_name                     = "VexMy"
    site_url                             = "https://vexmy.com"
} | ConvertTo-Json

try {
    $headers = @{
        Authorization  = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Invoke-RestMethod -Method Patch `
        -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" `
        -Headers $headers `
        -Body $authBody | Out-Null
    Write-Host "Auth SMTP OK." -ForegroundColor Green
} catch {
    Write-Host "Auth SMTP API failed — finish manually in browser (opening now)..." -ForegroundColor Yellow
    Start-Process "https://supabase.com/dashboard/project/$projectRef/auth/smtp"
    Write-Host $_.Exception.Message -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Test: https://vexmy.com/auth -> Forgot your password?" -ForegroundColor Cyan
Write-Host ""

# Fix Supabase Auth SMTP (password reset). Edge function secrets do NOT control this.
# Usage: .\scripts\fix-auth-smtp.ps1
# Requires: npx supabase login (or paste sbp_ token when prompted)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$projectRef = "tkremoxfkgoiuwghtzwd"

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
Write-Host "=== Fix Velbok Auth SMTP (password reset) ===" -ForegroundColor Cyan
Write-Host ""

$token = Get-SupabaseAccessToken
if (-not $token) {
    Write-Host "Supabase access token required." -ForegroundColor Yellow
    Write-Host "Run: npx supabase login" -ForegroundColor Gray
    Write-Host "Or create one: https://supabase.com/dashboard/account/tokens" -ForegroundColor Gray
    $token = Read-Host "Paste token (sbp_...)"
}

Write-Host "Resend API key (re_...) from https://resend.com/api-keys" -ForegroundColor Yellow
$resendKey = (Read-Host "Paste Resend API key").Trim()
if (-not $resendKey.StartsWith("re_")) {
    Write-Host "Invalid key — must start with re_" -ForegroundColor Red
    exit 1
}

$sender = Read-Host "Sender email [no-reply@velbok.com]"
if (-not $sender) { $sender = "no-reply@velbok.com" }

$authBody = @{
    external_email_enabled = $true
    smtp_host              = "smtp.resend.com"
    smtp_port              = 465
    smtp_user              = "resend"
    smtp_pass              = $resendKey
    smtp_admin_email       = $sender
    smtp_sender_name       = "Velbok"
    smtp_max_frequency     = 120
    site_url               = "https://velbok.com"
} | ConvertTo-Json

$headers = @{
    Authorization  = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    $current = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" -Headers $headers
    Write-Host "Current SMTP host: $($current.smtp_host)" -ForegroundColor Gray
    Write-Host "Current sender:    $($current.smtp_admin_email)" -ForegroundColor Gray
} catch {
    Write-Host "Could not read current config: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Updating Auth SMTP..." -ForegroundColor Yellow
Invoke-RestMethod -Method Patch `
    -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" `
    -Headers $headers `
    -Body $authBody | Out-Null

Write-Host "Auth SMTP updated." -ForegroundColor Green
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "1. Resend -> Domains -> velbok.com must be Verified" -ForegroundColor White
Write-Host "2. Resend -> Emails -> check for bounces on $sender" -ForegroundColor White
Write-Host "3. Supabase -> Auth -> Email Templates -> reset Recovery to default if customised" -ForegroundColor White
Write-Host "4. Test forgot password on https://velbok.com/auth" -ForegroundColor White
Write-Host ""
Start-Process "https://supabase.com/dashboard/project/$projectRef/auth/smtp"
Start-Process "https://supabase.com/dashboard/project/$projectRef/auth/templates"
Start-Process "https://resend.com/emails"

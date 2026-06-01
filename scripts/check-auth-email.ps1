# Diagnose Velbok password-reset (Supabase Auth SMTP) — run: .\scripts\check-auth-email.ps1
param(
  [string]$TestEmail = "",
  [string]$AccessToken = ""
)

$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

$projectRef = "tkremoxfkgoiuwghtzwd"
$siteUrl = "https://velbok.com"
$redirectTo = "$siteUrl/auth?mode=recovery"

Write-Host ""
Write-Host "=== Velbok password-reset email check ===" -ForegroundColor Cyan
Write-Host ""

# 1. DNS (Resend)
Write-Host "1. Resend DNS (send.velbok.com)..." -ForegroundColor Yellow
$spf = (nslookup -type=TXT send.velbok.com 2>&1 | Out-String)
$mx = (nslookup -type=MX send.velbok.com 2>&1 | Out-String)
$dkim = (nslookup -type=TXT resend._domainkey.velbok.com 2>&1 | Out-String)
$dnsOk = ($spf -match "spf1") -and ($mx -match "amazonses") -and ($dkim -match "p=MIG")
if ($dnsOk) {
  Write-Host "   OK — SPF, MX, and DKIM records look present" -ForegroundColor Green
} else {
  Write-Host "   WARN — DNS incomplete. Verify velbok.com in Resend -> Domains." -ForegroundColor Red
}

# 2. App env
Write-Host ""
Write-Host "2. Local .env Supabase keys..." -ForegroundColor Yellow
$envFile = Get-Content .env -Raw -ErrorAction SilentlyContinue
if (-not $envFile) {
  Write-Host "   FAIL — no .env file" -ForegroundColor Red
  exit 1
}
if ($envFile -match 'VITE_SUPABASE_URL=(\S+)') { $url = $Matches[1].Trim() } else { $url = "" }
if ($envFile -match 'VITE_SUPABASE_PUBLISHABLE_KEY=(\S+)') { $anonKey = $Matches[1].Trim() } else { $anonKey = "" }
if ($url -and $anonKey) {
  Write-Host "   OK — $url" -ForegroundColor Green
} else {
  Write-Host "   FAIL — missing VITE_SUPABASE_URL or anon key" -ForegroundColor Red
  exit 1
}

# 3. Auth SMTP via Management API (if token provided)
Write-Host ""
Write-Host "3. Supabase Auth SMTP (password reset uses THIS, not edge secrets)..." -ForegroundColor Yellow
if (-not $AccessToken) {
  foreach ($p in @(
      "$env:USERPROFILE\.supabase\access-token",
      "$env:APPDATA\supabase\access-token",
      "$env:LOCALAPPDATA\supabase\access-token"
    )) {
    if (Test-Path $p) { $AccessToken = (Get-Content $p -Raw).Trim(); break }
  }
}
if ($AccessToken) {
  try {
    $auth = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" `
      -Headers @{ Authorization = "Bearer $AccessToken" }
    $smtpOn = [bool]$auth.smtp_host -and [bool]$auth.smtp_admin_email
    if ($smtpOn) {
      Write-Host "   OK — Custom SMTP configured" -ForegroundColor Green
      Write-Host "      Host: $($auth.smtp_host):$($auth.smtp_port)" -ForegroundColor Gray
      Write-Host "      From: $($auth.smtp_sender_name) <$($auth.smtp_admin_email)>" -ForegroundColor Gray
      Write-Host "      Site URL: $($auth.site_url)" -ForegroundColor Gray
      if ($auth.site_url -ne $siteUrl) {
        Write-Host "   WARN — site_url is not $siteUrl (reset links may break)" -ForegroundColor Yellow
      }
    } else {
      Write-Host "   FAIL — Auth SMTP not configured. Enable in Dashboard -> Auth -> SMTP." -ForegroundColor Red
    }
  } catch {
    Write-Host "   FAIL — could not read auth config: $($_.Exception.Message)" -ForegroundColor Red
  }
} else {
  Write-Host "   SKIP — run: npx supabase login" -ForegroundColor Yellow
  Write-Host "   Or: .\scripts\check-auth-email.ps1 -AccessToken sbp_..." -ForegroundColor Gray
}

# 4. Trigger recover
Write-Host ""
Write-Host "4. Trigger password reset API..." -ForegroundColor Yellow
if (-not $TestEmail) {
  $TestEmail = Read-Host "   Email to test (must exist in Supabase Auth users)"
}
$body = (@{ email = $TestEmail.Trim(); redirect_to = $redirectTo } | ConvertTo-Json)
try {
  Invoke-RestMethod -Uri "$url/auth/v1/recover" -Method Post `
    -Headers @{
      apikey         = $anonKey
      Authorization  = "Bearer $anonKey"
      "Content-Type" = "application/json"
    } `
    -Body $body | Out-Null
  Write-Host "   OK — Supabase accepted the request (no error returned to app)" -ForegroundColor Green
  Write-Host "   Note: API returns OK even if email is unknown (security)." -ForegroundColor Gray
} catch {
  Write-Host "   FAIL — $($_.ErrorDetails.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== If still no email ===" -ForegroundColor Cyan
Write-Host "A. Supabase -> Authentication -> SMTP -> Enable Custom SMTP" -ForegroundColor White
Write-Host "     Host smtp.resend.com | Port 465 | User resend | Pass = re_ API key" -ForegroundColor White
Write-Host "     Sender: no-reply@velbok.com | Name: Velbok" -ForegroundColor White
Write-Host "B. Supabase -> Authentication -> URL Configuration" -ForegroundColor White
Write-Host "     Site URL: $siteUrl | Redirects: $siteUrl/**" -ForegroundColor White
Write-Host "C. Supabase -> Authentication -> Logs — look for SMTP errors" -ForegroundColor White
Write-Host "D. Resend -> Emails — see if send failed or bounced" -ForegroundColor White
Write-Host "E. Hotmail/Outlook: check Junk + Quarantine; add no-reply@velbok.com to safe senders" -ForegroundColor White
Write-Host "F. Edge Function secrets do NOT send password resets — only Auth SMTP does." -ForegroundColor Yellow
Write-Host ""
Write-Host "Quick fix script: .\scripts\setup-email-now.ps1 (step 4 configures Auth SMTP)" -ForegroundColor Gray
Write-Host ""
Start-Process "https://supabase.com/dashboard/project/$projectRef/auth/logs"
Start-Process "https://supabase.com/dashboard/project/$projectRef/auth/smtp"
Start-Process "https://resend.com/emails"

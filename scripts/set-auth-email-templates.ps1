# Point Supabase auth email links at /auth/app-callback with token_hash (no PKCE verifier needed).
# Fixes native signup: verifyOtp(token_hash) works after reinstall / cross-device, unlike ?code= PKCE links.
# Usage: .\scripts\set-auth-email-templates.ps1
# Requires: npx supabase login (or SUPABASE_ACCESS_TOKEN env var)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$projectRef = "tkremoxfkgoiuwghtzwd"
$siteUrl = "https://velbok.com"
$callback = "$siteUrl/auth/app-callback"

function Get-SupabaseAccessToken {
    foreach ($p in @(
            "$env:USERPROFILE\.supabase\access-token"
            "$env:APPDATA\supabase\access-token"
            "$env:LOCALAPPDATA\supabase\access-token"
        )) {
        if (Test-Path $p) { return (Get-Content $p -Raw).Trim() }
    }
    if ($env:SUPABASE_ACCESS_TOKEN) { return $env:SUPABASE_ACCESS_TOKEN.Trim() }
    return $null
}

$token = Get-SupabaseAccessToken
if (-not $token) {
    Write-Host "No Supabase token - run: npx supabase login" -ForegroundColor Red
    exit 1
}

$headers = @{
    Authorization  = "Bearer $token"
    "Content-Type" = "application/json"
}

function New-EmailHtml {
    param([string]$Heading, [string]$Body, [string]$Link, [string]$Cta)
    return @"
<div style="margin:0;padding:32px 16px;background:#0c0c0f;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#101216;border:1px solid rgba(212,175,55,0.35);border-radius:16px;padding:32px 28px;text-align:center">
    <p style="margin:0 0 4px;font-size:20px;font-weight:700;letter-spacing:0.12em;color:#d4af37">VELBOK</p>
    <div style="height:1px;width:120px;margin:0 auto 20px;background:linear-gradient(90deg,transparent,#d4af37,transparent)"></div>
    <h1 style="margin:0 0 12px;font-size:20px;color:#f5f5f5">$Heading</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#a1a1aa">$Body</p>
    <a href="$Link" style="display:inline-block;background:#d4af37;color:#0c0c0f;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:10px">$Cta</a>
    <p style="margin:24px 0 0;font-size:12px;color:#71717a">If you didn't request this, you can safely ignore this email.</p>
  </div>
</div>
"@
}

$confirmLink = "$callback?token_hash={{ .TokenHash }}&type=signup&redirect_to={{ .RedirectTo }}"
$recoveryLink = "$callback?token_hash={{ .TokenHash }}&type=recovery&mode=recovery&redirect_to={{ .RedirectTo }}"
$magicLink = "$callback?token_hash={{ .TokenHash }}&type=magiclink&redirect_to={{ .RedirectTo }}"
$emailChangeLink = "$callback?token_hash={{ .TokenHash }}&type=email_change&redirect_to={{ .RedirectTo }}"
$inviteLink = "$callback?token_hash={{ .TokenHash }}&type=invite&redirect_to={{ .RedirectTo }}"

$body = @{
    mailer_subjects_confirmation           = "Confirm your Velbok account"
    mailer_templates_confirmation_content  = (New-EmailHtml "Confirm your email" "Tap the button below on the phone with the Velbok app installed to finish creating your account." $confirmLink "Confirm email")
    mailer_subjects_recovery               = "Reset your Velbok password"
    mailer_templates_recovery_content      = (New-EmailHtml "Reset your password" "Tap the button below to choose a new password for your Velbok account." $recoveryLink "Reset password")
    mailer_subjects_magic_link             = "Your Velbok sign-in link"
    mailer_templates_magic_link_content    = (New-EmailHtml "Sign in to Velbok" "Tap the button below to sign in. This link can only be used once." $magicLink "Sign in")
    mailer_subjects_email_change           = "Confirm your new Velbok email"
    mailer_templates_email_change_content  = (New-EmailHtml "Confirm email change" "Tap the button below to confirm your new email address." $emailChangeLink "Confirm new email")
    mailer_subjects_invite                 = "You've been invited to Velbok"
    mailer_templates_invite_content        = (New-EmailHtml "Join Velbok" "Tap the button below to accept your invitation and set up your account." $inviteLink "Accept invite")
} | ConvertTo-Json -Depth 4

Write-Host "Updating auth email templates (token_hash links)..." -ForegroundColor Yellow
Invoke-RestMethod -Method Patch `
    -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" `
    -Headers $headers `
    -Body $body | Out-Null

$updated = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" -Headers $headers
Write-Host "Done." -ForegroundColor Green
Write-Host "  Confirmation subject: $($updated.mailer_subjects_confirmation)" -ForegroundColor Green
if ($updated.mailer_templates_confirmation_content -match "token_hash") {
    Write-Host "  Confirmation template now uses token_hash via /auth/app-callback" -ForegroundColor Green
} else {
    Write-Host "  WARN - confirmation template does not contain token_hash" -ForegroundColor Red
}

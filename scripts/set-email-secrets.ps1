# Interactive setup for Supabase edge function email secrets.
# See docs/email-setup.md for Resend / Supabase Auth SMTP instructions.

param(
    [ValidateSet("resend", "brevo", "custom")]
    [string]$Provider = "resend"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host ""
Write-Host "VexMy email secrets (Supabase Edge Functions)" -ForegroundColor Cyan
Write-Host "Auth password-reset email is configured separately in Supabase Dashboard -> Authentication -> SMTP." -ForegroundColor Gray
Write-Host ""

function Read-Secret([string]$Prompt, [string]$Default = "") {
    if ($Default) {
        $v = Read-Host "$Prompt [$Default]"
        if ([string]::IsNullOrWhiteSpace($v)) { return $Default }
        return $v
    }
    return Read-Host $Prompt
}

$siteUrl = Read-Secret "SITE_URL (links in emails)" "https://vexmy.com"
$supportEmail = Read-Secret "Support / reply-to email" "hello@vexmy.com"
$shopName = Read-Secret "SHOP_NAME (email branding)" "VexMy"

switch ($Provider) {
    "resend" {
        Write-Host ""
        Write-Host "Resend SMTP (recommended): create API key at resend.com, verify vexmy.com domain first." -ForegroundColor Yellow
        $apiKey = Read-Host "Resend API key (re_...)" -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($apiKey)
        $apiKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

        $fromName = Read-Secret "From display name" "VexMy"
        $fromEmail = Read-Secret "From email (must be verified in Resend)" $supportEmail
        $emailFrom = "$fromName <$fromEmail>"

        $setResend = Read-Host "Also set RESEND_API_KEY for consent emails? (y/N)"
        $useResendApi = $setResend -eq "y" -or $setResend -eq "Y"

        Write-Host ""
        Write-Host "Setting secrets on linked Supabase project..." -ForegroundColor Cyan

        npx supabase secrets set `
            SMTP_HOST=smtp.resend.com `
            SMTP_PORT=465 `
            SMTP_USER=resend `
            "SMTP_PASS=$apiKeyPlain" `
            "EMAIL_FROM=$emailFrom" `
            "SITE_URL=$siteUrl" `
            "SHOP_SUPPORT_EMAIL=$supportEmail" `
            "SHOP_NAME=$shopName" `
            "SHOP_WEBSITE_URL=$siteUrl"

        if ($useResendApi) {
            npx supabase secrets set "RESEND_API_KEY=$apiKeyPlain"
        }
    }
    "brevo" {
        Write-Host ""
        Write-Host "Brevo: use SMTP relay credentials from app.brevo.com -> SMTP & API." -ForegroundColor Yellow
        $host_ = Read-Secret "SMTP_HOST" "smtp-relay.brevo.com"
        $port = Read-Secret "SMTP_PORT" "587"
        $user = Read-Host "SMTP_USER (login email)"
        $pass = Read-Host "SMTP_PASS (SMTP key)" -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass)
        $passPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        $fromEmail = Read-Secret "From email" $supportEmail
        $emailFrom = Read-Secret "EMAIL_FROM" "VexMy <$fromEmail>"

        npx supabase secrets set `
            "SMTP_HOST=$host_" `
            "SMTP_PORT=$port" `
            "SMTP_USER=$user" `
            "SMTP_PASS=$passPlain" `
            "EMAIL_FROM=$emailFrom" `
            "SITE_URL=$siteUrl" `
            "SHOP_SUPPORT_EMAIL=$supportEmail" `
            "SHOP_NAME=$shopName" `
            "SHOP_WEBSITE_URL=$siteUrl"
    }
    "custom" {
        $host_ = Read-Host "SMTP_HOST"
        $port = Read-Host "SMTP_PORT"
        $user = Read-Host "SMTP_USER"
        $pass = Read-Host "SMTP_PASS" -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass)
        $passPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        $emailFrom = Read-Host "EMAIL_FROM (e.g. Studio Name <noreply@yourdomain.com>)"

        npx supabase secrets set `
            "SMTP_HOST=$host_" `
            "SMTP_PORT=$port" `
            "SMTP_USER=$user" `
            "SMTP_PASS=$passPlain" `
            "EMAIL_FROM=$emailFrom" `
            "SITE_URL=$siteUrl" `
            "SHOP_SUPPORT_EMAIL=$supportEmail" `
            "SHOP_NAME=$shopName" `
            "SHOP_WEBSITE_URL=$siteUrl"
    }
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed. Run: npx supabase login && npm run db:link" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Edge function secrets saved." -ForegroundColor Green
Write-Host ""
Write-Host "Next: Supabase Dashboard -> Authentication -> SMTP Settings" -ForegroundColor Yellow
Write-Host "  Use the same SMTP host/user/password and hello@vexmy.com sender for password reset." -ForegroundColor Yellow
Write-Host "  Full guide: docs/email-setup.md" -ForegroundColor Gray
Write-Host ""

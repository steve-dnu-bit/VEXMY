# Quick email diagnosis — run after trying "Forgot password" on vexmy.com
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host ""
Write-Host "=== VexMy email diagnosis ===" -ForegroundColor Cyan
Write-Host ""

# DNS
Write-Host "1. Resend DNS (send.vexmy.com)..." -ForegroundColor Yellow
$spf = nslookup -type=TXT send.vexmy.com 2>&1 | Out-String
$mx = nslookup -type=MX send.vexmy.com 2>&1 | Out-String
if ($spf -match "spf1" -and $mx -match "amazonses") {
    Write-Host "   OK — SPF and MX found" -ForegroundColor Green
} else {
    Write-Host "   FAIL — DNS missing. Verify domain in Resend." -ForegroundColor Red
}

# Supabase CLI secrets
Write-Host ""
Write-Host "2. Supabase edge secrets (SMTP_PASS set?)..." -ForegroundColor Yellow
$secretsOut = npx supabase secrets list 2>&1 | Out-String
if ($secretsOut -match "Access token not provided") {
    Write-Host "   SKIP — run: npx supabase login" -ForegroundColor Yellow
} elseif ($secretsOut -match "SMTP_PASS") {
    Write-Host "   OK — SMTP secrets exist on project" -ForegroundColor Green
} else {
    Write-Host "   FAIL — no SMTP secrets. Run: .\scripts\setup-email-now.ps1" -ForegroundColor Red
}

# Auth recover test
Write-Host ""
Write-Host "3. Supabase password-reset trigger..." -ForegroundColor Yellow
$envFile = Get-Content .env -Raw -ErrorAction SilentlyContinue
if ($envFile -match 'VITE_SUPABASE_URL=(.+?)\r?\n') { $url = $Matches[1].Trim() }
if ($envFile -match 'VITE_SUPABASE_PUBLISHABLE_KEY=(.+?)\r?\n') { $key = $Matches[1].Trim() }
$email = Read-Host "   Email to test (e.g. mr.tattooist@hotmail.com)"
$body = (@{ email = $email; redirect_to = "https://vexmy.com/auth?mode=recovery" } | ConvertTo-Json)
try {
    Invoke-RestMethod -Uri "$url/auth/v1/recover" -Method Post `
        -Headers @{ apikey = $key; Authorization = "Bearer $key"; "Content-Type" = "application/json" } `
        -Body $body | Out-Null
    Write-Host "   OK — Supabase accepted reset request (check inbox + spam in 2 min)" -ForegroundColor Green
    Write-Host "   If no email: Auth Custom SMTP is NOT configured in Supabase." -ForegroundColor Yellow
} catch {
    Write-Host "   FAIL — $($_.ErrorDetails.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Most common fix ===" -ForegroundColor Cyan
Write-Host "Supabase Dashboard -> Authentication -> SMTP -> Enable Custom SMTP" -ForegroundColor White
Write-Host "  Host: smtp.resend.com  Port: 465  User: resend  Pass: your re_ key" -ForegroundColor White
Write-Host "  Sender: no-reply@vexmy.com" -ForegroundColor White
Write-Host ""
Write-Host "Or run: .\scripts\setup-email-now.ps1" -ForegroundColor White
Write-Host "Then check Resend -> Logs for delivery status." -ForegroundColor Gray
Write-Host ""

Start-Process "https://supabase.com/dashboard/project/tkremoxfkgoiuwghtzwd/auth/smtp"
Start-Process "https://resend.com/emails"

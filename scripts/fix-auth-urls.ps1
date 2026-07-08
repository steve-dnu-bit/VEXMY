# Set Velbok production auth URLs (Site URL + redirect allow list).
# Usage: .\scripts\fix-auth-urls.ps1
# Requires: npx supabase login

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$projectRef = "tkremoxfkgoiuwghtzwd"
$siteUrl = "https://velbok.com"
$redirectUrls = @(
    "$siteUrl/**"
    "$siteUrl/auth/app-callback"
    "com.velbok.app://auth/callback"
    "http://localhost:5173/**"
    "http://localhost:8080/**"
) -join ","

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

Write-Host "Reading current auth config..." -ForegroundColor Cyan
$current = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" -Headers $headers
Write-Host "  Current site_url: $($current.site_url)" -ForegroundColor Gray
Write-Host "  Current uri_allow_list: $($current.uri_allow_list)" -ForegroundColor Gray

$body = @{
    site_url       = $siteUrl
    uri_allow_list = $redirectUrls
} | ConvertTo-Json

Write-Host "Updating auth URLs..." -ForegroundColor Yellow
Invoke-RestMethod -Method Patch `
    -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" `
    -Headers $headers `
    -Body $body | Out-Null

$updated = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/config/auth" -Headers $headers
Write-Host "Done." -ForegroundColor Green
Write-Host "  site_url: $($updated.site_url)" -ForegroundColor Green
Write-Host "  uri_allow_list: $($updated.uri_allow_list)" -ForegroundColor Green

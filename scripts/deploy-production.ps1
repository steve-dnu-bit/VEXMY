# Build locally and deploy to production (velbok.com). Asks for confirmation first.
param(
    [switch]$SkipBuild,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not $Yes) {
    $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
    Write-Host "This will deploy to PRODUCTION (velbok.com)." -ForegroundColor Yellow
    Write-Host "Current branch: $branch" -ForegroundColor Yellow
    $confirm = Read-Host "Type yes to continue"
    if ($confirm -ne "yes") {
        Write-Host "Cancelled." -ForegroundColor Gray
        exit 0
    }
}

if (-not $SkipBuild) {
    Write-Host "Building..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Deploying to production..." -ForegroundColor Cyan
npx netlify-cli deploy --prod --dir=dist
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy failed. Run: npx netlify-cli login && npx netlify-cli link" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Production deploy complete." -ForegroundColor Green

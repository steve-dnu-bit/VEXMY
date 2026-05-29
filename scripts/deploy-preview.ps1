# Build locally and upload a draft preview to Netlify (no remote build).
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not $SkipBuild) {
    Write-Host "Building..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Deploying draft preview (upload only)..." -ForegroundColor Cyan
npx netlify-cli deploy --dir=dist
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deploy failed. Run: npx netlify-cli login && npx netlify-cli link" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Done. Open the Draft URL above to preview." -ForegroundColor Green

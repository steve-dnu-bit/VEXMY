# Fix Velbok Netlify build settings (run after: npx netlify login)
# Usage: .\scripts\fix-netlify-velbok.ps1 [-SiteName "velbok"]

param(
  [string]$SiteName = "velbok"
)

$ErrorActionPreference = "Stop"

Write-Host "Checking Netlify login..."
$whoami = npx --yes netlify-cli@17.36.4 api getCurrentUser 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in. Run: npx netlify login"
  exit 1
}

Write-Host "Finding site matching '$SiteName'..."
$sitesJson = npx --yes netlify-cli@17.36.4 api listSites --data "{}" 2>&1 | Out-String
$sites = $sitesJson | ConvertFrom-Json
$site = $sites | Where-Object { $_.name -match $SiteName -or $_.custom_domain -match $SiteName } | Select-Object -First 1

if (-not $site) {
  Write-Host "No site found. Available sites:"
  $sites | ForEach-Object { Write-Host "  - $($_.name) ($($_.id)) $($_.url)" }
  exit 1
}

Write-Host "Updating site: $($site.name) ($($site.site_id))"

$body = @{
  site_id = $site.site_id
  body    = @{
    build_settings = @{
      cmd           = "npm run build"
      dir           = "dist"
      base          = $null
      functions_dir = $null
    }
  }
} | ConvertTo-Json -Depth 5 -Compress

npx --yes netlify-cli@17.36.4 api updateSite --data $body

if ($LASTEXITCODE -ne 0) {
  Write-Host "Failed to update site."
  exit 1
}

Write-Host "Build settings updated:"
Write-Host "  Base directory: (empty)"
Write-Host "  Build command:  npm run build"
Write-Host "  Publish dir:    dist"
Write-Host ""
Write-Host "Set env vars in Netlify UI (Site settings -> Environment variables):"
Write-Host "  VITE_SUPABASE_URL=https://tkremoxfkgoiuwghtzwd.supabase.co"
Write-Host "  VITE_SUPABASE_PUBLISHABLE_KEY=<anon key from Supabase>"
Write-Host "  VITE_SUPABASE_PROJECT_ID=tkremoxfkgoiuwghtzwd"
Write-Host ""
Write-Host "Trigger deploy: npx netlify deploy --prod --site $($site.site_id)"

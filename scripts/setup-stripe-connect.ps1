# Creates Stripe Connect Express accounts for all organizations and prints onboarding URLs.
# Shop owners must still complete Stripe hosted KYC and bank form in a browser.

$ErrorActionPreference = "Stop"
$ProjectRef = "tkremoxfkgoiuwghtzwd"

$keysJson = npx supabase@latest projects api-keys --project-ref $ProjectRef -o json | ConvertFrom-Json
$svc = ($keysJson | Where-Object { $_.name -eq "service_role" }).api_key
if (-not $svc) { throw "Could not read service_role API key" }

$uri = "https://$ProjectRef.supabase.co/functions/v1/setup-stripe-connect"
$result = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
  Authorization = "Bearer $svc"
  apikey        = $svc
  "Content-Type" = "application/json"
} -Body '{"returnPath":"/admin"}' -TimeoutSec 180

if (-not $result.ok) { throw "Setup failed: $($result | ConvertTo-Json -Compress)" }

Write-Host "Stripe mode: $($result.stripeMode)"
Write-Host "All ready: $($result.allReady)"
Write-Host ""

foreach ($org in $result.organizations) {
  Write-Host "=== $($org.organizationName) ==="
  Write-Host "Account: $($org.accountId)"
  Write-Host "Ready: $($org.ready)"
  if ($org.onboardingUrl) {
    Write-Host "Onboarding URL:"
    Write-Host $org.onboardingUrl
  } else {
    Write-Host "Already active - no onboarding needed."
  }
  Write-Host ""
}

if (-not $result.allReady) {
  Write-Host "Next: open each onboarding URL and complete Stripe forms."
}

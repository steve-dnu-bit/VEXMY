# Creates/finds Velbok subscription prices in Stripe (test mode) and updates Supabase secrets.
# Requires: supabase CLI linked to project, network access.

$ErrorActionPreference = "Stop"
$ProjectRef = "tkremoxfkgoiuwghtzwd"

$keysJson = npx supabase@latest projects api-keys --project-ref $ProjectRef -o json | ConvertFrom-Json
$svc = ($keysJson | Where-Object { $_.name -eq "service_role" }).api_key
if (-not $svc) { throw "Could not read service_role API key" }

$uri = "https://$ProjectRef.supabase.co/functions/v1/setup-platform-stripe-prices"
$result = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
  Authorization = "Bearer $svc"
  apikey        = $svc
  "Content-Type" = "application/json"
} -Body "{}" -TimeoutSec 120

if (-not $result.ok) { throw "Setup failed: $($result | ConvertTo-Json -Compress)" }

$secrets = $result.secrets
npx supabase@latest secrets set `
  "STRIPE_PRICE_STARTER=$($secrets.STRIPE_PRICE_STARTER)" `
  "STRIPE_PRICE_STUDIO=$($secrets.STRIPE_PRICE_STUDIO)" `
  "STRIPE_PRICE_ENTERPRISE=$($secrets.STRIPE_PRICE_ENTERPRISE)" `
  --project-ref $ProjectRef

Write-Host "Stripe mode: $($result.stripeMode)"
Write-Host "STRIPE_PRICE_STARTER=$($secrets.STRIPE_PRICE_STARTER)"
Write-Host "STRIPE_PRICE_STUDIO=$($secrets.STRIPE_PRICE_STUDIO)"
Write-Host "STRIPE_PRICE_ENTERPRISE=$($secrets.STRIPE_PRICE_ENTERPRISE)"
Write-Host "Done. Subscription checkout should work now."

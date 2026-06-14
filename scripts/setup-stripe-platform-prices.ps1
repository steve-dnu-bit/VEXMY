# Creates/finds Velbok subscription prices in Stripe (all billing currencies) and updates Supabase secrets + DB.
# Uses Stripe API via edge function (STRIPE_SECRET_KEY already in Supabase) — no Stripe CLI required.
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
} -Body "{}" -TimeoutSec 300

if (-not $result.ok) { throw "Setup failed: $($result | ConvertTo-Json -Compress -Depth 6)" }

$secretArgs = @()
foreach ($prop in $result.secrets.PSObject.Properties) {
  $secretArgs += "$($prop.Name)=$($prop.Value)"
}

if ($secretArgs.Count -eq 0) { throw "No secrets returned from setup-platform-stripe-prices" }

Write-Host "Setting $($secretArgs.Count) Stripe price secrets..."
npx supabase@latest secrets set @secretArgs --project-ref $ProjectRef

Write-Host "Stripe mode: $($result.stripeMode)"
Write-Host "Currencies: $($result.currencies -join ', ')"
Write-Host "Plans configured: $($result.plans.Count) prices"
foreach ($prop in $result.secrets.PSObject.Properties) {
  Write-Host "$($prop.Name)=$($prop.Value)"
}
Write-Host "Done. Multi-currency subscription checkout should work now."

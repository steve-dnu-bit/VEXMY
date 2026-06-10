# Creates Velbok stripe-webhook endpoint in Stripe and updates STRIPE_WEBHOOK_SECRET in Supabase.
# Requires: supabase CLI linked to project, network access.

$ErrorActionPreference = "Stop"
$ProjectRef = "tkremoxfkgoiuwghtzwd"

$keysJson = npx supabase@latest projects api-keys --project-ref $ProjectRef -o json | ConvertFrom-Json
$svc = ($keysJson | Where-Object { $_.name -eq "service_role" }).api_key
if (-not $svc) { throw "Could not read service_role API key" }

$uri = "https://$ProjectRef.supabase.co/functions/v1/setup-stripe-webhook"
$result = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
  Authorization = "Bearer $svc"
  apikey        = $svc
  "Content-Type" = "application/json"
} -Body "{}" -TimeoutSec 120

if (-not $result.ok) { throw "Setup failed: $($result | ConvertTo-Json -Compress)" }

$secret = $result.secrets.STRIPE_WEBHOOK_SECRET
npx supabase@latest secrets set "STRIPE_WEBHOOK_SECRET=$secret" --project-ref $ProjectRef

Write-Host "Stripe mode: $($result.stripeMode)"
Write-Host "Webhook URL: $($result.webhookUrl)"
Write-Host "Endpoint ID: $($result.endpointId)"
Write-Host "STRIPE_WEBHOOK_SECRET updated."
Write-Host "Done. Stripe webhooks should deliver to Supabase now."

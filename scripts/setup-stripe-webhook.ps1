# Platform webhook (optional skip DB reset):
#   .\scripts\setup-stripe-webhook.ps1 -SkipDatabaseReset
# Requires: supabase CLI linked to project, network access.

param(
  [switch]$SkipDatabaseReset
)

$ErrorActionPreference = "Stop"
$ProjectRef = "tkremoxfkgoiuwghtzwd"

$keysJson = npx supabase@latest projects api-keys --project-ref $ProjectRef -o json | ConvertFrom-Json
$svc = ($keysJson | Where-Object { $_.name -eq "service_role" }).api_key
if (-not $svc) { throw "Could not read service_role API key" }

$uri = "https://$ProjectRef.supabase.co/functions/v1/setup-stripe-webhook"
$body = if ($SkipDatabaseReset) { '{"skipDatabaseReset":true}' } else { '{}' }
$result = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
  Authorization = "Bearer $svc"
  apikey        = $svc
  "Content-Type" = "application/json"
} -Body $body -TimeoutSec 120

if (-not $result.ok) { throw "Setup failed: $($result | ConvertTo-Json -Compress)" }

$secret = $result.secrets.STRIPE_WEBHOOK_SECRET
npx supabase@latest secrets set "STRIPE_WEBHOOK_SECRET=$secret" --project-ref $ProjectRef

Write-Host "Stripe mode: $($result.stripeMode)"
Write-Host "Webhook URL: $($result.webhookUrl)"
Write-Host "Endpoint ID: $($result.endpointId)"
Write-Host "Database reset: $($result.databaseReset)"
Write-Host "STRIPE_WEBHOOK_SECRET updated."
Write-Host "Done. Stripe webhooks should deliver to Supabase now."

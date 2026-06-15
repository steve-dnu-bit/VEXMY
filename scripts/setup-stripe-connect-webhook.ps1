# Registers a Stripe webhook on the Connect platform account (e.g. Inkaholics Limited).
# Uses STRIPE_CONNECT_SECRET_KEY when set, otherwise STRIPE_SECRET_KEY.
# Prints STRIPE_CONNECT_WEBHOOK_SECRET to add in Supabase Edge Function secrets.
#
# Usage:
#   .\scripts\setup-stripe-connect-webhook.ps1
#   .\scripts\setup-stripe-connect-webhook.ps1 -ServiceRoleKey "eyJhbG..."
#   $env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbG..."; .\scripts\setup-stripe-connect-webhook.ps1

param(
  [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY,
  [string]$ProjectRef = "tkremoxfkgoiuwghtzwd"
)

$ErrorActionPreference = "Stop"

function Get-ServiceRoleKey {
  param([string]$ExplicitKey, [string]$Ref)

  if ($ExplicitKey) { return $ExplicitKey.Trim() }

  Write-Host "Fetching service_role key via Supabase CLI..." -ForegroundColor Gray
  try {
    $raw = npx supabase@latest projects api-keys --project-ref $Ref -o json 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw ($raw | Out-String).Trim()
    }
    $keysJson = $raw | ConvertFrom-Json
    $legacy = $keysJson | Where-Object { $_.name -eq "service_role" -and $_.api_key -notmatch "^\s*$" } | Select-Object -First 1
    if ($legacy?.api_key) { return $legacy.api_key }
    throw "CLI returned keys but no legacy service_role entry was found."
  } catch {
    throw @"
Could not load Supabase API keys automatically.

Fix options:
  1. Log in:  npx supabase@latest login
     Then rerun: .\scripts\setup-stripe-connect-webhook.ps1

  2. Pass the service role key from Supabase Dashboard:
     Project Settings -> API -> service_role (Reveal)
     .\scripts\setup-stripe-connect-webhook.ps1 -ServiceRoleKey "eyJhbG..."

  3. Skip this script and add the webhook manually in Stripe (Inkaholics account):
     Developers -> Webhooks -> Add endpoint
     URL: https://$Ref.supabase.co/functions/v1/stripe-webhook
     Events: checkout.session.completed, checkout.session.async_payment_succeeded,
             account.updated, payment_intent.succeeded
     Copy signing secret -> Supabase secret STRIPE_CONNECT_WEBHOOK_SECRET

CLI error: $($_.Exception.Message)
"@
  }
}

$svc = Get-ServiceRoleKey -ExplicitKey $ServiceRoleKey -Ref $ProjectRef
if (-not $svc) { throw "Service role key is empty." }

$uri = "https://$ProjectRef.supabase.co/functions/v1/setup-stripe-connect-webhook"
$result = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
  Authorization = "Bearer $svc"
  apikey        = $svc
  "Content-Type" = "application/json"
} -Body '{}' -TimeoutSec 120

if (-not $result.ok) { throw "Setup failed: $($result | ConvertTo-Json -Compress)" }

Write-Host "Stripe mode: $($result.stripeMode)"
Write-Host "Separate Connect platform: $($result.connectPlatform)"
Write-Host "Webhook URL: $($result.webhookUrl)"
Write-Host ""
Write-Host "Add this Supabase Edge Function secret:"
Write-Host "STRIPE_CONNECT_WEBHOOK_SECRET = $($result.secrets.STRIPE_CONNECT_WEBHOOK_SECRET)"
Write-Host ""
Write-Host $result.nextStep

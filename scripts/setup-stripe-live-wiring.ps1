# Live Stripe wiring: webhooks + connect account link + status sync.
# Prerequisites: STRIPE_SECRET_KEY and STRIPE_CONNECT_SECRET_KEY set in Supabase (live sk_ keys).
#
# Usage:
#   .\scripts\setup-stripe-live-wiring.ps1
#   .\scripts\setup-stripe-live-wiring.ps1 -ServiceRoleKey "eyJhbG..."

param(
  [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY,
  [string]$ProjectRef = "tkremoxfkgoiuwghtzwd",
  [string]$ConnectAccountId = "acct_1TFFWdAxFvqjl4T2",
  [string]$TattooistEmail = "mr.tattooist@hotmail.com"
)

$ErrorActionPreference = "Stop"

function Get-ServiceRoleKey {
  param([string]$ExplicitKey, [string]$Ref)

  if ($ExplicitKey) { return $ExplicitKey.Trim() }

  Write-Host "Fetching service_role key via Supabase CLI..." -ForegroundColor Gray
  $raw = npx supabase@latest projects api-keys --project-ref $Ref -o json 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($raw | Out-String).Trim() }
  $keysJson = $raw | ConvertFrom-Json
  $legacy = $keysJson | Where-Object { $_.name -eq "service_role" -and $_.api_key -notmatch "^\s*$" } | Select-Object -First 1
  if ($legacy?.api_key) { return $legacy.api_key }
  throw "Could not read service_role API key. Run: npx supabase@latest login"
}

function Invoke-EdgeFunction {
  param(
    [string]$Name,
    [string]$Svc,
    [string]$Ref,
    [object]$Body = @{}
  )
  $uri = "https://$Ref.supabase.co/functions/v1/$Name"
  $json = if ($Body -is [string]) { $Body } else { ($Body | ConvertTo-Json -Compress) }
  return Invoke-RestMethod -Uri $uri -Method POST -Headers @{
    Authorization  = "Bearer $Svc"
    apikey         = $Svc
    "Content-Type" = "application/json"
  } -Body $json -TimeoutSec 180
}

$svc = Get-ServiceRoleKey -ExplicitKey $ServiceRoleKey -Ref $ProjectRef
$base = "https://$ProjectRef.supabase.co/rest/v1"
$headers = @{
  Authorization  = "Bearer $svc"
  apikey         = $svc
  "Content-Type" = "application/json"
  Prefer         = "return=representation"
}

Write-Host "=== Step 4a: Velbok platform webhook (no DB reset) ===" -ForegroundColor Cyan
$platform = Invoke-EdgeFunction -Name "setup-stripe-webhook" -Svc $svc -Ref $ProjectRef -Body @{ skipDatabaseReset = $true }
if (-not $platform.ok) { throw "Platform webhook failed: $($platform | ConvertTo-Json -Compress)" }
Write-Host "Platform webhook: $($platform.endpointId) ($($platform.stripeMode))"
npx supabase@latest secrets set "STRIPE_WEBHOOK_SECRET=$($platform.secrets.STRIPE_WEBHOOK_SECRET)" --project-ref $ProjectRef

Write-Host ""
Write-Host "=== Step 4b: Shop Connect webhook ===" -ForegroundColor Cyan
$connect = Invoke-EdgeFunction -Name "setup-stripe-connect-webhook" -Svc $svc -Ref $ProjectRef -Body @{}
if (-not $connect.ok) { throw "Connect webhook failed: $($connect | ConvertTo-Json -Compress)" }
Write-Host "Connect webhook: $($connect.endpointId) (separate platform: $($connect.connectPlatform))"
npx supabase@latest secrets set "STRIPE_CONNECT_WEBHOOK_SECRET=$($connect.secrets.STRIPE_CONNECT_WEBHOOK_SECRET)" --project-ref $ProjectRef

Write-Host ""
Write-Host "=== Step 5: Link shop Connect account to tattooist org ===" -ForegroundColor Cyan
$authUsers = Invoke-RestMethod -Uri "https://$ProjectRef.supabase.co/auth/v1/admin/users?page=1&per_page=200" -Headers @{
  Authorization = "Bearer $svc"
  apikey        = $svc
}
$user = $authUsers.users | Where-Object { $_.email -and ($_.email -ieq $TattooistEmail) } | Select-Object -First 1
if (-not $user) {
  $user = $authUsers.users | Where-Object { $_.email -match 'tattooist' } | Select-Object -First 1
}
$userId = $user?.id

if (-not $userId) {
  Write-Warning "Could not resolve user id for $TattooistEmail. Run link-tattooist-connect-account.sql manually."
} else {
  $membersUri = ('{0}/organization_members?user_id=eq.{1}&role=in.(owner,admin)&select=organization_id,role' -f $base, $userId)
  $members = Invoke-RestMethod -Uri $membersUri -Headers $headers
  $orgId = ($members | Sort-Object { if ($_.role -eq "owner") { 0 } else { 1 } } | Select-Object -First 1).organization_id
  if (-not $orgId) {
    Write-Warning "No org membership for $TattooistEmail"
  } else {
    $patch = @{
      stripe_connect_account_id          = $ConnectAccountId
      stripe_connect_charges_enabled     = $false
      stripe_connect_payouts_enabled     = $false
      stripe_connect_details_submitted   = $false
      stripe_connect_onboarded_at        = $null
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$base/organizations?id=eq.$orgId" -Method PATCH -Headers $headers -Body $patch | Out-Null
    Write-Host "Linked org $orgId -> $ConnectAccountId"
  }
}

Write-Host ""
Write-Host "=== Step 6: Sync Connect status from Stripe ===" -ForegroundColor Cyan
$sync = Invoke-EdgeFunction -Name "setup-stripe-connect" -Svc $svc -Ref $ProjectRef -Body @{ returnPath = "/admin"; syncOnly = $true }
if ($sync.ok) {
  foreach ($org in $sync.organizations) {
    Write-Host "$($org.organizationName): $($org.accountId) ready=$($org.ready)"
  }
} else {
  Write-Warning "Connect sync via setup-stripe-connect failed — open Admin -> Payouts to refresh status"
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Webhook secrets saved. Next (manual):"
Write-Host "  1. Deploy edge functions if setup-stripe-webhook was updated: npx supabase functions deploy setup-stripe-webhook"
Write-Host "  2. Admin -> POS checkout -> Create Terminal location"
Write-Host "  3. Register WisePad on SHOP Stripe -> Terminal -> Readers"
Write-Host "  4. Test one live deposit and one WisePad charge"

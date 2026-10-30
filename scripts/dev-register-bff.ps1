# Registers one device's sign-in client, identity-experience-bff-<device>, in identity-control on a
# development server built from zero: deploy/dev/README.md, First start step 2, "It does not exist (a new
# server)", as one procedure (STD-GLB-009: a procedure step is a script). The client is confidential,
# privileged in the provider-scope form, names the Identity Control API's resource as its audience, and
# redirects to this BFF's callback alone. It authenticates with the key whose public half -JwkFile holds
# (ADR-IAM-001 §5.12): keys/identity-experience-bff.jwk.json, made on the laptop by
# scripts/new-client-key.mjs. Only kty, n and e are sent.
#
# One registration per developer device (STD-GLB-009 rule 15, ADR-IAM-001 §5.12): -Device names it, and
# that laptop sets IDENTITY_EXPERIENCE_CLIENT_ID to the client this prints. A client registered before is
# refused by identity-control, and the script stops there: a new key for it is a rotation, and a client
# that create-bff-client.sh made is adopted instead (identity-control's scripts/dev-adopt-bff.ps1).
#
# It runs where identity-control's scripts run, with a provider-scope token at aal2 for the bootstrap
# operator from identity-control's scripts/dev-token.ps1. On a server from zero that token needs the
# server's own TOTP, bound by identity-control's first dev-adopt-caller.ps1 run (its deploy/dev/README.md
# §First start, step 8); until this client exists no browser can sign in.
#
# SECRETS: read from the environment, as identity-control's dev-smoke.ps1 reads them, and never printed.
#   $env:IDENTITY_CALLER_KEY_FILE      identity-control-caller's private key (identity-control's .env)
#   $env:IDENTITY_CALLER_PASSWORD      the bootstrap operator's password
#   $env:IDENTITY_OPERATOR_TOTP_FILE   optional, the operator's TOTP file (dev-token.ps1)
#
# Usage, on the server:
#   pwsh ./scripts/dev-register-bff.ps1 -IdentityRepo /srv/identity-control -Device ada-laptop `
#       -JwkFile ./identity-experience-bff.jwk.json
#
# -BackChannelLogoutUri is for a BFF the kernel can reach, such as a CI stack's; a laptop's names none,
# because the kernel cannot reach it (README, The client).

param(
    [Parameter(Mandatory = $true)] [string] $IdentityRepo,
    [Parameter(Mandatory = $true)] [string] $JwkFile,
    # The device's name: the client is identity-experience-bff-<device>.
    [ValidatePattern('^[a-z0-9][a-z0-9-]*$')] [string] $Device,
    # The whole client identifier instead of -Device, for a stack that registers the unsuffixed client.
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,62}$')] [string] $ClientKey,
    [string] $RedirectUri = "http://127.0.0.1:8090/auth/callback",
    [string] $BackChannelLogoutUri
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($Device -and $ClientKey) { throw "Give -Device or -ClientKey, not both." }
if (-not $Device -and -not $ClientKey) { throw "Give -Device, the name of the laptop this client is for." }
if ($Device) {
    if ("identity-experience-bff-$Device".Length -gt 63) { throw "identity-experience-bff-$Device is longer than 63 characters; choose a shorter -Device." }
    $ClientKey = "identity-experience-bff-$Device"
}

foreach ($name in @("IDENTITY_CALLER_KEY_FILE", "IDENTITY_CALLER_PASSWORD")) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "$name is required." }
}

# Only the public members are sent; a private one is refused here before anything leaves.
$jwk = Get-Content -Raw $JwkFile | ConvertFrom-Json
foreach ($private in @("d", "p", "q", "dp", "dq", "qi")) {
    if ($jwk.PSObject.Properties.Name -contains $private) { throw "$JwkFile holds a private key; send the .jwk.json only." }
}
if ($jwk.kty -ne "RSA" -or -not $jwk.n -or -not $jwk.e) { throw "$JwkFile is not an RSA public JWK." }

$identityApi = if ($env:IDENTITY_API_URL) { $env:IDENTITY_API_URL } else { "http://127.0.0.1:8082" }
Add-Type -AssemblyName System.Net.Http
. (Join-Path $IdentityRepo "scripts/dev-token.ps1")
if (Get-Command Get-DevOperatorTotp -ErrorAction SilentlyContinue) {
    $operatorTotp = Get-DevOperatorTotp
} else {
    $operatorTotp = if ($env:IDENTITY_OPERATOR_TOTP_FILE) { @{ OperatorTotpFile = $env:IDENTITY_OPERATOR_TOTP_FILE } } else { @{} }
}
if (Get-Command Get-DevApiUrl -ErrorAction SilentlyContinue) { $identityApi = Get-DevApiUrl }

$token = Get-ScnehauxToken -Username "bootstrap-operator" -Password $env:IDENTITY_CALLER_PASSWORD `
    -KeyFile $env:IDENTITY_CALLER_KEY_FILE @operatorTotp

$declaration = @{
    client_key = $ClientKey; profile = "confidential"; audience_class = "privileged"
    privileged_form = "provider-scope"; application_ref = "identity-experience"
    redirect_uris = @($RedirectUri); audience = @("identity-control-api")
    public_key = @{ kty = $jwk.kty; n = $jwk.n; e = $jwk.e }
}
if ($BackChannelLogoutUri) { $declaration["backchannel_logout_uri"] = $BackChannelLogoutUri }
$body = $declaration | ConvertTo-Json -Compress -Depth 4

$client = New-Object System.Net.Http.HttpClient
$request = New-Object System.Net.Http.HttpRequestMessage("POST", "$identityApi/v1/registrations")
$request.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)
$request.Headers.Add("Idempotency-Key", "register-$ClientKey-$([Guid]::NewGuid().ToString('N'))")
$request.Headers.Add("X-Administrative-Reason", "registering the identity-experience BFF client $ClientKey")
$request.Content = New-Object System.Net.Http.StringContent($body, [System.Text.Encoding]::UTF8, "application/json")
$response = $client.SendAsync($request).Result
$text = $response.Content.ReadAsStringAsync().Result
if ([int]$response.StatusCode -ne 201) {
    throw "identity-control answered $([int]$response.StatusCode) to the registration: $text"
}
$registration = $text | ConvertFrom-Json
$id = $registration.PSObject.Properties["registration_id"]
Write-Host "registered $ClientKey$(if ($id) { ": registration $($id.Value)" })"
Write-Host ""
Write-Host "On the laptop, in .env: IDENTITY_EXPERIENCE_CLIENT_ID=$ClientKey"

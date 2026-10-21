# Registers one device's enrolment workload on a development server: deploy/dev/README.md, First start
# step 4, as one procedure (STD-GLB-009: a procedure step is a script). The BFF calls
# identity-control's two enrolment routes as this workload, with its own client and key, one per
# device (ADR-IAM-011 §5.8, ADR-IAM-003 §5.8, STD-GLB-009 rule 15; TDD-identity-experience-001 1.24.0).
#
#   1. a provider creates the workload in identity-control, bound to its own client in the kernel,
#      with the device's public key and the operator as its accountable owner (POST /v1/workloads);
#   2. a provider registers it as an enrolment caller, with a purpose and a reason
#      (POST /v1/enrolment-callers, TDD-identity-control-001 1.27.0).
#
# The private key never leaves the laptop: it runs `node scripts/new-client-key.mjs
# identity-experience-enrolment` and sends keys/identity-experience-enrolment.jwk.json. Run once per
# device, from zero; each creation is refused when it was made before, and the script stops there. A
# lost device's caller is retired in the Admin Portal (Workloads, Enrolment callers), and its workload
# suspended or retired there too.
#
# SECRETS: read from the environment, as identity-control's dev-smoke.ps1 reads them, never printed.
#   $env:IDENTITY_CALLER_KEY_FILE      identity-control-caller's private key (identity-control's .env)
#   $env:IDENTITY_CALLER_PASSWORD      the bootstrap operator's password
#   $env:IDENTITY_OPERATOR_TOTP_FILE   optional, the operator's TOTP file (dev-token.ps1)
#
# Usage, on the server:
#   pwsh ./scripts/dev-wire-enrolment.ps1 -IdentityRepo /srv/identity-control -Device ada-laptop `
#       -JwkFile ./identity-experience-enrolment.jwk.json
#
# It prints the client to set as IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_ID in that laptop's .env.

param(
    [Parameter(Mandatory = $true)] [string] $IdentityRepo,
    # The device's name, as in its sign-in client identity-experience-bff-<device>.
    [Parameter(Mandatory = $true)] [ValidatePattern('^[a-z0-9][a-z0-9-]*$')] [string] $Device,
    [Parameter(Mandatory = $true)] [string] $JwkFile
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

foreach ($name in @("IDENTITY_CALLER_KEY_FILE", "IDENTITY_CALLER_PASSWORD")) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "$name is required." }
}

$identityApi = if ($env:IDENTITY_API_URL) { $env:IDENTITY_API_URL } else { "http://127.0.0.1:8082" }
Add-Type -AssemblyName System.Net.Http
. (Join-Path $IdentityRepo "scripts/dev-token.ps1")
if (Get-Command Get-DevOperatorTotp -ErrorAction SilentlyContinue) {
    $operatorTotp = Get-DevOperatorTotp
} else {
    $operatorTotp = if ($env:IDENTITY_OPERATOR_TOTP_FILE) { @{ OperatorTotpFile = $env:IDENTITY_OPERATOR_TOTP_FILE } } else { @{} }
}
if (Get-Command Get-DevApiUrl -ErrorAction SilentlyContinue) { $identityApi = Get-DevApiUrl }

$client = New-Object System.Net.Http.HttpClient
$run = [Guid]::NewGuid().ToString("N").Substring(0, 8)
$clientKey = "identity-experience-enrolment-$Device"

function Send-Json($method, $url, $body, $bearer, $idempotencyKey) {
    $request = New-Object System.Net.Http.HttpRequestMessage($method, $url)
    $request.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $bearer)
    $request.Headers.Add("X-Administrative-Reason", "wiring the enrolment page of $Device")
    $request.Headers.Add("Idempotency-Key", "$idempotencyKey-$run")
    $request.Content = New-Object System.Net.Http.StringContent($body, [System.Text.Encoding]::UTF8, "application/json")
    $response = $client.SendAsync($request).Result
    return @{ code = [int]$response.StatusCode; body = $response.Content.ReadAsStringAsync().Result }
}

function Require($label, $response, $want) {
    if ($response.code -ne $want) { throw "$label answered $($response.code), want $($want): $($response.body)" }
    Write-Host "  ok    $label"
    return $response.body | ConvertFrom-Json
}

function Decode-Claims([string] $jwt) {
    $s = $jwt.Split('.')[1].Replace('-', '+').Replace('_', '/')
    switch ($s.Length % 4) { 2 { $s += '==' } 3 { $s += '=' } }
    return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($s)) | ConvertFrom-Json
}

# Only the public members are sent; a private one is refused here before anything leaves.
$jwk = Get-Content -Raw $JwkFile | ConvertFrom-Json
foreach ($private in @("d", "p", "q", "dp", "dq", "qi")) {
    if ($jwk.PSObject.Properties.Name -contains $private) { throw "$JwkFile holds a private key; send the .jwk.json only." }
}
$publicKey = @{ kty = $jwk.kty; n = $jwk.n; e = $jwk.e }

$token = Get-ScnehauxToken -Username "bootstrap-operator" -Password $env:IDENTITY_CALLER_PASSWORD `
    -KeyFile $env:IDENTITY_CALLER_KEY_FILE @operatorTotp
$operator = (Decode-Claims $token).principal_id

Write-Host "1. the enrolment workload of $Device"
$workload = Require "$clientKey created" (Send-Json "POST" "$identityApi/v1/workloads" (@{
            display_name = $clientKey
            purpose = "Calls identity-control's enrolment routes for the enrolment page of $Device"
            workload_type = "service"; owner_principal_id = $operator; client_key = $clientKey
            application_ref = "identity-experience"; audience = @("identity-control-api"); public_key = $publicKey
        } | ConvertTo-Json -Compress -Depth 4) $token "enrolment-workload") 201

Write-Host "2. registered as an enrolment caller"
$null = Require "$clientKey registered" (Send-Json "POST" "$identityApi/v1/enrolment-callers" (@{
            principal_id = $workload.principal_id
            purpose = "The enrolment BFF of $Device"
        } | ConvertTo-Json -Compress) $token "enrolment-caller") 201

Write-Host ""
Write-Host "On $Device, in .env: IDENTITY_EXPERIENCE_ENROLMENT_CLIENT_ID=$clientKey"
Write-Host "Workload principal_id: $($workload.principal_id)"

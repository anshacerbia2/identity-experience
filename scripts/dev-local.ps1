<#
.SYNOPSIS
  Runs the BFF and the admin application on this machine, signing in against the development
  kernel on the server.

.DESCRIPTION
  Nothing here needs Docker. Keycloak stays on the server; this machine runs the BFF on
  http://127.0.0.1:8090, which serves the built admin application at /, the Developer Console
  at /developer/ and the account security experience at /account/, and keeps its sessions in the
  local PostgreSQL.

  Reads .env beside the repository root (copy .env.example). The BFF authenticates to the kernel
  with its own key (private_key_jwt), keys/identity-experience-bff.pem, made on this machine by
  scripts/new-client-key.mjs. Its public half is installed on the server once; the client has no
  secret (ADR-IAM-001 §5.12).

  Steps: build the application and the BFF, create the session schema if absent, apply the
  session store's migrations, and serve. Ctrl+C stops the server.
#>
[CmdletBinding()]
param(
    # Skip the build when only the server needs restarting.
    [switch] $NoBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
$schema = 'identity_experience_dev'
# Not localhost:8080: the dev tunnel forwards the server's 8080 and rewrites a redirect to
# localhost:8080 into its own URL, so Keycloak's return to the callback never reached this machine.
# The client's registered redirect URI (deploy/dev/create-bff-client.sh) is this origin's.
$port = '8090'
$origin = "http://127.0.0.1:$port"

if (-not (Test-Path $envFile)) {
    throw "No .env at $envFile. Copy .env.example."
}

function Read-DotEnv([string] $path) {
    $values = [ordered]@{}
    foreach ($line in [IO.File]::ReadAllLines($path)) {
        if ($line -match '^\s*([A-Z0-9_]+)=(.*)$') {
            $values[$Matches[1]] = $Matches[2].Trim()
        }
    }
    return $values
}

$dotenv = Read-DotEnv $envFile

# A session key is generated once and written back, so a restart does not strand every session.
if (-not $dotenv.Contains('IDENTITY_EXPERIENCE_SESSION_KEY') -or $dotenv['IDENTITY_EXPERIENCE_SESSION_KEY'] -eq '') {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $key = [Convert]::ToBase64String($bytes)
    $text = [IO.File]::ReadAllText($envFile)
    $pattern = '(?m)^IDENTITY_EXPERIENCE_SESSION_KEY=.*$'
    if ($text -match $pattern) {
        $text = [regex]::Replace($text, $pattern, "IDENTITY_EXPERIENCE_SESSION_KEY=$key")
    } else {
        if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += "`n" }
        $text += "IDENTITY_EXPERIENCE_SESSION_KEY=$key`n"
    }
    [IO.File]::WriteAllText($envFile, $text, (New-Object Text.UTF8Encoding $false))
    $dotenv['IDENTITY_EXPERIENCE_SESSION_KEY'] = $key
    Write-Host 'dev-local: generated IDENTITY_EXPERIENCE_SESSION_KEY and wrote it to .env'
}

foreach ($required in @('IDENTITY_EXPERIENCE_DEV_DATABASE_URL')) {
    if (-not $dotenv.Contains($required) -or $dotenv[$required] -eq '') {
        throw "$required is empty in .env. See .env.example."
    }
}

function Get-OrDefault([string] $name, [string] $default) {
    if ($dotenv.Contains($name) -and $dotenv[$name] -ne '') { return $dotenv[$name] }
    return $default
}

$database = [UriBuilder] $dotenv['IDENTITY_EXPERIENCE_DEV_DATABASE_URL']
$searchPath = "options=$([Uri]::EscapeDataString("-c search_path=$schema"))"
$database.Query = if ($database.Query.TrimStart('?') -eq '') { $searchPath } else { "$($database.Query.TrimStart('?'))&$searchPath" }
$sessionDatabase = $database.Uri.AbsoluteUri

$env:IDENTITY_EXPERIENCE_PUBLIC_ORIGIN = $origin
$env:IDENTITY_EXPERIENCE_WEB_ROOT = Join-Path $root 'apps\admin\dist'
$env:IDENTITY_EXPERIENCE_DEVELOPER_WEB_ROOT = Join-Path $root 'apps\developer\dist'
$env:IDENTITY_EXPERIENCE_ACCOUNT_WEB_ROOT = Join-Path $root 'apps\account\dist'
$env:IDENTITY_EXPERIENCE_LISTEN_HOST = '127.0.0.1'
$env:IDENTITY_EXPERIENCE_LISTEN_PORT = $port
$env:IDENTITY_EXPERIENCE_ISSUER = Get-OrDefault 'IDENTITY_EXPERIENCE_ISSUER' 'https://gqr8l4jz-8080.asse.devtunnels.ms/realms/scnehaux'
$env:IDENTITY_EXPERIENCE_CLIENT_ID = 'identity-experience-bff'
$clientKey = Get-OrDefault 'IDENTITY_EXPERIENCE_CLIENT_KEY_FILE' (Join-Path $root 'keys\identity-experience-bff.pem')
if (-not (Test-Path $clientKey)) {
    throw "No client key at $clientKey. Run: node scripts/new-client-key.mjs, then have the server's operator install keys\identity-experience-bff.jwk.json (README.md)."
}
$env:IDENTITY_EXPERIENCE_CLIENT_KEY_FILE = $clientKey
$env:IDENTITY_EXPERIENCE_REDIRECT_URI = "$origin/auth/callback"
$env:IDENTITY_EXPERIENCE_SESSION_KEY = $dotenv['IDENTITY_EXPERIENCE_SESSION_KEY']
$env:IDENTITY_EXPERIENCE_DATABASE_URL = $sessionDatabase
$env:IDENTITY_CONTROL_BASE_URL = Get-OrDefault 'IDENTITY_CONTROL_BASE_URL' 'http://127.0.0.1:8097'
$env:LOG_LEVEL = Get-OrDefault 'LOG_LEVEL' 'info'

Push-Location $root
try {
    if (-not $NoBuild) {
        pnpm build
        if ($LASTEXITCODE -ne 0) { throw 'build failed' }
    }

    # The schema first: migrations create tables, not the schema they live in.
    $env:DEV_DATABASE_URL = $dotenv['IDENTITY_EXPERIENCE_DEV_DATABASE_URL']
    Push-Location (Join-Path $root 'bff')
    try {
        node --input-type=module -e "import pg from 'pg'; const c = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL }); await c.connect(); await c.query('CREATE SCHEMA IF NOT EXISTS $schema'); await c.end();"
        if ($LASTEXITCODE -ne 0) { throw "could not create schema $schema" }
        $env:IDENTITY_EXPERIENCE_MIGRATION_DATABASE_URL = $sessionDatabase
        pnpm migrate
        if ($LASTEXITCODE -ne 0) { throw 'migrations failed' }
    } finally {
        Pop-Location
        Remove-Item Env:DEV_DATABASE_URL -ErrorAction SilentlyContinue
        Remove-Item Env:IDENTITY_EXPERIENCE_MIGRATION_DATABASE_URL -ErrorAction SilentlyContinue
    }

    Write-Host "dev-local: open $origin and sign in. Ctrl+C stops the server."
    node (Join-Path $root 'bff\dist\main.js')
} finally {
    Pop-Location
}

# One-time setup for the cloud (Neon) database behind the Vercel deployment.
# Applies every migration, then creates (or resets) an admin user.
#
#   powershell -ExecutionPolicy Bypass -File scripts\setup-cloud-db.ps1
#
# Run it in your own PowerShell window: it prompts for the connection string, the three keys and
# the admin password. Nothing is written to disk; the values live only in this process.
# HASH_KEY and ENCRYPTION_KEY must be the same values set on the Vercel project, or the API
# cannot read what this script writes.

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RootDir

function Read-Secret([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Invoke-Step([string]$Label, [scriptblock]$Command) {
    Write-Host "==> $Label"
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Label failed (exit $LASTEXITCODE)" }
}

Write-Host "Paste the DIRECT Neon connection string (host without '-pooler')."
$databaseUrl = Read-Secret "DATABASE_URL"
if ($databaseUrl -notmatch '^postgres(ql)?://') { throw "DATABASE_URL must start with postgres:// or postgresql://" }
if ($databaseUrl -match '-pooler\.') {
    Write-Warning "This looks like the POOLED endpoint. The app needs the direct one; remove '-pooler' from the host."
    if ((Read-Host "Continue anyway? (y/N)") -ne 'y') { exit 1 }
}
if ($databaseUrl -notmatch 'sslmode=') {
    $databaseUrl += $(if ($databaseUrl.Contains('?')) { '&' } else { '?' }) + 'sslmode=require'
}

$env:DATABASE_URL = $databaseUrl
$env:HASH_KEY = Read-Secret "HASH_KEY"
$env:ENCRYPTION_KEY = Read-Secret "ENCRYPTION_KEY"
$env:SESSION_SECRET = Read-Secret "SESSION_SECRET"
$env:NODE_ENV = "production"
$env:LOG_LEVEL = "warn"

try {
    if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
        Invoke-Step "Installing dependencies" { npm ci }
    }

    Invoke-Step "Applying migrations" { npm run db:migrate }

    $email = Read-Host "Admin email"
    $name = Read-Host "Admin full name"
    Write-Host "You will be asked for the admin password (min 12 characters) twice."
    Invoke-Step "Creating admin user" { npm run user:create -- --email $email --name $name --role admin }

    Write-Host ""
    Write-Host "Done. Sign in at https://omniatesting.vercel.app with $email."
}
finally {
    foreach ($key in 'DATABASE_URL', 'HASH_KEY', 'ENCRYPTION_KEY', 'SESSION_SECRET') {
        Remove-Item "Env:$key" -ErrorAction SilentlyContinue
    }
}

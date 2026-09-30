# Standard startup path for Omnia Recon (hx harness), PowerShell equivalent of init.sh:
# install, baseline checks, then optionally start the database, migrate and run the API.

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

function Invoke-Step([string]$Command) {
    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "==> Working directory: $RootDir"
Write-Host "==> Syncing dependencies"
Invoke-Step "npm ci"

Write-Host "==> Running baseline verification (lint + typecheck)"
Invoke-Step "npm run lint"
Invoke-Step "npm run typecheck"

Write-Host "==> Startup: docker compose up -d --wait db; npm run db:migrate; npm run dev:server"
if ($env:RUN_START_COMMAND -eq "1") {
    Write-Host "==> Starting the app"
    Invoke-Step "docker compose up -d --wait db"
    Invoke-Step "npm run db:migrate"
    Invoke-Step "npm run dev:server"
} else {
    Write-Host 'Set $env:RUN_START_COMMAND = "1" to start the database, apply migrations and launch the API.'
}

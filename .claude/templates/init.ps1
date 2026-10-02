# init.ps1 — PowerShell equivalent of init.sh.
# The course's templates and all its startup instructions are bash-only (`./init.sh`,
# `chmod +x`), which does not run under Windows PowerShell (course-issue #12/#50). This script
# does the same three steps: install, verify, print/optionally run the start command.

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

# Replace these with the correct commands for your repository.
$InstallCmd = "{{INSTALL_CMD}}"
$VerifyCmd  = "{{VERIFY_CMD}}"
$StartCmd   = "{{START_CMD}}"

Write-Host "==> Working directory: $RootDir"
Write-Host "==> Syncing dependencies"
Invoke-Expression $InstallCmd
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Running baseline verification"
Invoke-Expression $VerifyCmd
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Startup command"
Write-Host "    $StartCmd"

if ($env:RUN_START_COMMAND -eq "1") {
    Write-Host "==> Starting the app"
    Invoke-Expression $StartCmd
} else {
    Write-Host 'Set $env:RUN_START_COMMAND = "1" if you want init.ps1 to launch the app directly.'
}

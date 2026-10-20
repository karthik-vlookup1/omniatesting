# Seeds (or removes) the VECO push demo receipts and a staff link on the cloud (Neon) database.
#
#   powershell -ExecutionPolicy Bypass -File scripts\cloud-demo-seed.ps1 seed -Staff StaffPK
#   powershell -ExecutionPolicy Bypass -File scripts\cloud-demo-seed.ps1 remove
#
# Run it in your own PowerShell window: it prompts for the DIRECT connection string and the three
# keys (masked). Nothing is written to disk; the values live only in this process. HASH_KEY must be
# the value set on the Vercel project. Only demo-marked rows are created or removed.

param(
    [Parameter(Mandatory = $true, Position = 0)][ValidateSet('seed', 'remove')][string]$Action,
    [string]$User,
    [string]$Staff,
    [string]$Receipts = 'T5755=997.27,T6008=890.00,T2822=950.00,T5126=1045.00,T7074=1045.00,T7684=1045.00,T7703=1045.00'
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RootDir

function Read-Secret([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# Runs demo-seed.ts against the cloud and returns its last stdout line as an object.
function Invoke-Demo([string[]]$DemoArgs) {
    $lines = @(npx tsx server/src/services/veco-push/demo-seed.ts @DemoArgs --cloud)
    if ($LASTEXITCODE -ne 0) { throw "demo-seed failed (exit $LASTEXITCODE)" }
    return ($lines | Select-Object -Last 1) | ConvertFrom-Json
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

# The typed URL must win over any URL already in this shell.
Remove-Item Env:DATABASE_URL_UNPOOLED -ErrorAction SilentlyContinue
Remove-Item Env:NEON_DATABASE_URL_UNPOOLED -ErrorAction SilentlyContinue
$env:DATABASE_URL = $databaseUrl
$env:HASH_KEY = Read-Secret "HASH_KEY"
$env:ENCRYPTION_KEY = Read-Secret "ENCRYPTION_KEY"
$env:SESSION_SECRET = Read-Secret "SESSION_SECRET"
$env:NODE_ENV = "production"
$env:LOG_LEVEL = "warn"

try {
    if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed (exit $LASTEXITCODE)" }
    }

    if ($Action -eq 'remove') {
        $r = Invoke-Demo @('remove')
        Write-Host "Removed: $($r.receiptsRemoved) receipts, $($r.tenanciesRemoved) tenancies, $($r.staffLinksRemoved) staff links"
    }
    else {
        if (-not $User) {
            $emails = @((Invoke-Demo @('users')).emails)
            if ($emails.Count -eq 0) { throw "No active admin or accounts users on this database" }
            for ($i = 0; $i -lt $emails.Count; $i++) { Write-Host ("{0}. {1}" -f ($i + 1), $emails[$i]) }
            $pick = Read-Host "Number of the login to link"
            $n = 0
            if (-not [int]::TryParse($pick, [ref]$n) -or $n -lt 1 -or $n -gt $emails.Count) { throw "Aborted: not a listed number" }
            $User = $emails[$n - 1]
        }
        if (-not $Staff) {
            $Staff = (Read-Host "VECO StaffPK").Trim()
            if (-not $Staff) { throw "Aborted: no StaffPK" }
        }
        $r = Invoke-Demo @('seed', '--user', $User, '--staff', $Staff, '--receipts', $Receipts)
        Write-Host "Seeded: $($r.receiptsCreated) created, $($r.receiptsWaiting) waiting, $($r.tenanciesCreated) new tenancies. Login to use: $($r.linkedUser) (staff link $($r.staffLink))"
    }
}
finally {
    foreach ($key in 'DATABASE_URL', 'HASH_KEY', 'ENCRYPTION_KEY', 'SESSION_SECRET', 'NODE_ENV', 'LOG_LEVEL') {
        Remove-Item "Env:$key" -ErrorAction SilentlyContinue
    }
}

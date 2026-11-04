#requires -Version 7.2
param([switch] $RegisterWorkspaceKey)

$ErrorActionPreference = 'Stop'
$launcherClock = [Diagnostics.Stopwatch]::StartNew()
$profilePath = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
$privateDirectory = Join-Path $profilePath '.arc-materials/gate-1b/materials-b2/receipt-probe'
$repository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$cli = Join-Path $PSScriptRoot 'single-receipt-probe.mjs'

function Invoke-ReceiptNode([string] $Mode, [securestring] $PrivateKey) {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    $info.WorkingDirectory = $repository
    $info.UseShellExecute = $false
    $info.Environment.Clear()
    foreach ($name in 'SystemRoot','PATH','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','HOMEDRIVE','HOMEPATH','ComSpec') {
        $value = [Environment]::GetEnvironmentVariable($name)
        if ($value) { $info.Environment[$name] = $value }
    }
    foreach ($arg in '--import','tsx',$cli,$Mode) { $info.ArgumentList.Add($arg) }
    $child = $null
    try {
        if ($PrivateKey) {
            $info.Environment['ARC_B1_SINGLE_RECEIPT_LAUNCHER_MS'] = [string]$launcherClock.ElapsedMilliseconds
            $info.Environment['ARC_B1_SINGLE_RECEIPT_ENABLED'] = 'owner-approved'
            $info.Environment['ARC_B1_SINGLE_RECEIPT_KEY'] = [Net.NetworkCredential]::new('', $PrivateKey).Password
        }
        $child = [Diagnostics.Process]::Start($info)
        $null = $info.Environment.Remove('ARC_B1_SINGLE_RECEIPT_KEY')
        $child.WaitForExit()
        return $child.ExitCode
    } finally {
        $info.Environment.Clear()
        if ($child) { $child.Dispose() }
    }
}

if ($RegisterWorkspaceKey) {
    # Register the independently displayed dashboard hash, before the operator supplies a secret.
    $reference = Read-Host 'From the materials-b2 workspace key details, enter its 64-character SHA-256 identifier' -AsSecureString
    try {
        $hex = [Net.NetworkCredential]::new('', $reference).Password
        if ($hex -cnotmatch '^[0-9a-f]{64}$') { throw 'Expected the lowercase dashboard key identifier.' }
        $bytes = [Text.Encoding]::UTF8.GetBytes("materials-b2" + [char]0 + $hex)
        $binding = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
        $null = [IO.Directory]::CreateDirectory($privateDirectory)
        $path = Join-Path $privateDirectory 'workspace-key-binding.txt'
        $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try {
            $stream.Write([Text.Encoding]::ASCII.GetBytes($binding))
            $stream.Flush($true)
        } finally { $stream.Dispose() }
        Write-Host 'Saved the private materials-b2 key binding.'
    } finally { $reference.Dispose() }
    exit 0
}

$preflight = Invoke-ReceiptNode '--preflight' $null
if ($preflight -ne 0) { exit $preflight }
$key = Read-Host 'Enter the saved materials-b2 API key for this single approved probe' -AsSecureString
try { $status = Invoke-ReceiptNode '--execute' $key }
finally { $key.Dispose() }
exit $status

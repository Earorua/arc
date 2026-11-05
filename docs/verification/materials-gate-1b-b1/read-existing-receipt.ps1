#requires -Version 7.2
$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$key = Read-Host 'READ ONLY: one lookup of the existing receipt, no inference and no new charge. Enter the saved materials-b2 API key' -AsSecureString
$info = [Diagnostics.ProcessStartInfo]::new()
$child = $null
try {
    $info.FileName = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    $info.WorkingDirectory = $repository
    $info.UseShellExecute = $false
    $info.Environment.Clear()
    foreach ($name in 'SystemRoot','PATH','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','HOMEDRIVE','HOMEPATH','ComSpec') {
        $value = [Environment]::GetEnvironmentVariable($name)
        if ($value) { $info.Environment[$name] = $value }
    }
    foreach ($arg in '--import','tsx',(Join-Path $PSScriptRoot 'read-existing-receipt.mjs'),'--read-only') { $info.ArgumentList.Add($arg) }
    $info.Environment['ARC_B1_EXISTING_RECEIPT_ENABLED'] = 'owner-invoked'
    $info.Environment['ARC_B1_EXISTING_RECEIPT_KEY'] = [Net.NetworkCredential]::new('', $key).Password
    $child = [Diagnostics.Process]::Start($info)
    $null = $info.Environment.Remove('ARC_B1_EXISTING_RECEIPT_KEY')
    $child.WaitForExit()
    $status = $child.ExitCode
} finally {
    $key.Dispose()
    $info.Environment.Clear()
    if ($child) { $child.Dispose() }
}
exit $status

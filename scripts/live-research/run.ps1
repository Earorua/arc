[CmdletBinding()]
param([switch]$ExecuteOne)

$ErrorActionPreference = 'Stop'
$validationExitCode = 1
$validationSecret = $null
$validationPlain = $null
$validationBstr = [IntPtr]::Zero
$validationChild = $null

try {
    $validationRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
    $validationNode = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    if ($ExecuteOne) {
        if ([Console]::IsInputRedirected) { throw 'Interactive terminal required' }
        Write-Host 'One live Research request: openai/gpt-5.6-sol; dedicated unused USD 1 key; no repair or retry.'
        $validationSecret = Read-Host 'Paste dedicated OpenRouter key (masked)' -AsSecureString
        $validationBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($validationSecret)
        $validationPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($validationBstr)
        if ($validationPlain -cnotmatch '^[A-Za-z0-9._-]{1,512}$') { throw 'Invalid key' }
    } else {
        Write-Host 'Offline dry-run: authored fixture only; no key input or real requests.'
    }

    $validationStart = [Diagnostics.ProcessStartInfo]::new()
    $validationStart.FileName = $validationNode
    $validationStart.WorkingDirectory = $validationRoot
    $validationStart.Arguments = 'scripts/live-research/runner.mjs'
    if ($ExecuteOne) { $validationStart.Arguments += ' --execute-one' }
    $validationStart.UseShellExecute = $false
    $validationStart.CreateNoWindow = $true
    $validationStart.RedirectStandardInput = $true
    # The child receives the entered key solely through its anonymous stdin pipe.
    $validationStart.EnvironmentVariables.Remove('OPENROUTER_API_KEY')
    $validationStart.EnvironmentVariables.Remove('NODE_OPTIONS')
    $validationChild = [Diagnostics.Process]::new()
    $validationChild.StartInfo = $validationStart
    [void]$validationChild.Start()
    try {
        if ($ExecuteOne) { $validationChild.StandardInput.Write($validationPlain) }
        $validationChild.StandardInput.Close()
    } finally {
        $validationPlain = $null
        if ($validationBstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($validationBstr)
            $validationBstr = [IntPtr]::Zero
        }
        if ($null -ne $validationSecret) { $validationSecret.Dispose(); $validationSecret = $null }
    }
    if (-not $validationChild.WaitForExit(180000)) {
        $validationChild.Kill()
        throw 'Validation deadline exceeded'
    }
    $validationExitCode = $validationChild.ExitCode
} catch {
    [Console]::Error.WriteLine('Live validation stopped (launcher-failed).')
} finally {
    $validationPlain = $null
    if ($validationBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($validationBstr) }
    if ($null -ne $validationSecret) { $validationSecret.Dispose() }
    if ($null -ne $validationChild) {
        try { if (-not $validationChild.HasExited) { $validationChild.Kill() } } catch { }
        $validationChild.Dispose()
    }
}
exit $validationExitCode

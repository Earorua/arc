[CmdletBinding()]
param(
    [string]$Mode,
    [string]$Scenario,
    [string]$Inventory,
    [string]$ArtifactReport,
    [string]$Approval,
    [string]$ReportName,
    [switch]$UseSystemProxy
)

$ErrorActionPreference = 'Stop'
$smokeExitCode = 1
$smokeSecret = $null
$smokePlain = $null
$smokeBstr = [IntPtr]::Zero
$smokeChild = $null
$smokeStdoutTask = $null
$smokeStderrTask = $null

try {
    $smokeRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
    $smokeDriver = Join-Path $smokeRoot 'scripts/test-research-cloud-smoke.mjs'
    if (-not (Test-Path -LiteralPath $smokeDriver -PathType Leaf)) { throw 'Driver unavailable' }

    if (@('start', 'status', 'replay') -cnotcontains $Mode) { throw 'Invalid mode' }
    if (@('long', 'after-r2', 'after-d1') -cnotcontains $Scenario) { throw 'Invalid scenario' }
    if ([string]::IsNullOrWhiteSpace($Inventory)) { throw 'Inventory required' }
    if ([string]::IsNullOrWhiteSpace($ArtifactReport)) { throw 'Artifact report required' }
    if ([string]::IsNullOrWhiteSpace($ReportName) -or $ReportName -cnotmatch '\A[a-z0-9][a-z0-9._-]{0,79}\z') { throw 'Invalid report name' }
    if (-not (Test-Path -LiteralPath $Inventory -PathType Leaf)) { throw 'Inventory unavailable' }
    if (-not (Test-Path -LiteralPath $ArtifactReport -PathType Leaf)) { throw 'Artifact report unavailable' }
    $smokeInventory = (Resolve-Path -LiteralPath $Inventory).Path
    $smokeArtifactReport = (Resolve-Path -LiteralPath $ArtifactReport).Path
    $smokeApproval = $null
    if ($Mode -ceq 'replay') {
        if ([string]::IsNullOrWhiteSpace($Approval) -or -not (Test-Path -LiteralPath $Approval -PathType Leaf)) { throw 'Approval required' }
        $smokeApproval = (Resolve-Path -LiteralPath $Approval).Path
    } elseif ($PSBoundParameters.ContainsKey('Approval')) { throw 'Approval only supported for replay' }
    $smokeNode = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source

    $smokeProxyUri = $null
    if ($UseSystemProxy) {
        if ((Get-Item -LiteralPath $smokeInventory).Length -gt 32768) { throw 'Inventory unavailable' }
        $smokeInventoryBytes = [IO.File]::ReadAllBytes($smokeInventory)
        if ($smokeInventoryBytes.Length -gt 32768) { throw 'Inventory unavailable' }
        $smokeUtf8 = [Text.UTF8Encoding]::new($false, $true)
        $smokeInventoryJson = $smokeUtf8.GetString($smokeInventoryBytes)
        $smokeInventoryObject = $smokeInventoryJson | ConvertFrom-Json -ErrorAction Stop
        if ($smokeInventoryObject -is [Array] -or $smokeInventoryObject.controlOrigin -isnot [string]) { throw 'Inventory origin unavailable' }
        $smokeControlOrigin = $smokeInventoryObject.controlOrigin
        try { $smokeControlUri = [Uri]$smokeControlOrigin } catch { throw 'Inventory origin unavailable' }
        $smokeInvalidControlOrigin = -not $smokeControlUri.IsAbsoluteUri -or $smokeControlUri.Scheme -cne 'https'
        $smokeInvalidControlOrigin = $smokeInvalidControlOrigin -or -not [string]::IsNullOrEmpty($smokeControlUri.UserInfo)
        $smokeInvalidControlOrigin = $smokeInvalidControlOrigin -or $smokeControlUri.AbsolutePath -cne '/'
        $smokeInvalidControlOrigin = $smokeInvalidControlOrigin -or -not [string]::IsNullOrEmpty($smokeControlUri.Query)
        $smokeInvalidControlOrigin = $smokeInvalidControlOrigin -or -not [string]::IsNullOrEmpty($smokeControlUri.Fragment)
        $smokeInvalidControlOrigin = $smokeInvalidControlOrigin -or $smokeControlOrigin -cne $smokeControlUri.GetLeftPart([UriPartial]::Authority)
        if ($smokeInvalidControlOrigin) { throw 'Inventory origin unavailable' }

        $smokeDefaultProxy = [Net.WebRequest]::DefaultWebProxy
        if ($null -eq $smokeDefaultProxy -or $smokeDefaultProxy.IsBypassed($smokeControlUri)) { throw 'System proxy unavailable' }
        $smokeProxyUri = $smokeDefaultProxy.GetProxy($smokeControlUri)
        $smokeInvalidProxy = $null -eq $smokeProxyUri
        if (-not $smokeInvalidProxy) {
            $smokeInvalidProxy = $smokeProxyUri.Scheme -cne 'http' -or -not [string]::IsNullOrEmpty($smokeProxyUri.UserInfo)
            $smokeInvalidProxy = $smokeInvalidProxy -or $smokeProxyUri.AbsolutePath -cne '/'
            $smokeInvalidProxy = $smokeInvalidProxy -or -not [string]::IsNullOrEmpty($smokeProxyUri.Query)
            $smokeInvalidProxy = $smokeInvalidProxy -or -not [string]::IsNullOrEmpty($smokeProxyUri.Fragment)
        }
        if ($smokeInvalidProxy) { throw 'System proxy unavailable' }
        $smokeProxyAddress = $null
        $smokeProxyIsLoopback = $smokeProxyUri.DnsSafeHost -ceq 'localhost'
        if ([Net.IPAddress]::TryParse($smokeProxyUri.DnsSafeHost, [ref]$smokeProxyAddress)) {
            $smokeProxyIsLoopback = [Net.IPAddress]::IsLoopback($smokeProxyAddress)
        }
        if (-not $smokeProxyIsLoopback) { throw 'System proxy unavailable' }
    }

    $smokeArgumentValues = @()
    if ($UseSystemProxy) { $smokeArgumentValues += '--use-env-proxy' }
    $smokeArgumentValues += @(
        $smokeDriver,
        $Mode,
        '--inventory',
        $smokeInventory,
        '--artifact-report',
        $smokeArtifactReport,
        '--scenario',
        $Scenario,
        '--report-name',
        $ReportName
    )
    if ($Mode -ceq 'replay') { $smokeArgumentValues += @('--approval', $smokeApproval) }
    if ($smokeArgumentValues | Where-Object { $_ -match '["\r\n]' }) { throw 'Invalid child argument' }
    $smokeArguments = (($smokeArgumentValues | ForEach-Object { '"' + $_ + '"' }) -join ' ')

    if ([Console]::IsInputRedirected) { throw 'Interactive terminal required' }
    $smokeSecret = Read-Host 'Paste 64-hex cloud smoke control secret (masked)' -AsSecureString
    $smokeBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($smokeSecret)
    $smokePlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($smokeBstr)
    if ($smokePlain -cnotmatch '\A[0-9a-f]{64}\z') { throw 'Invalid control secret' }

    $smokeStart = [Diagnostics.ProcessStartInfo]::new()
    $smokeStart.FileName = $smokeNode
    $smokeStart.WorkingDirectory = $smokeRoot
    $smokeStart.Arguments = $smokeArguments
    $smokeStart.UseShellExecute = $false
    $smokeStart.CreateNoWindow = $true
    $smokeStart.RedirectStandardInput = $true
    $smokeStart.RedirectStandardOutput = $true
    $smokeStart.RedirectStandardError = $true
    $smokeStart.EnvironmentVariables.Remove('NODE_OPTIONS')
    if ($UseSystemProxy) {
        foreach ($smokeProxyVariable in @('HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy', 'ALL_PROXY', 'all_proxy')) {
            $smokeStart.EnvironmentVariables.Remove($smokeProxyVariable)
        }
        $smokeStart.EnvironmentVariables['HTTPS_PROXY'] = $smokeProxyUri.AbsoluteUri
    }

    $smokeChild = [Diagnostics.Process]::new()
    $smokeChild.StartInfo = $smokeStart
    [void]$smokeChild.Start()
    $smokeStdoutTask = $smokeChild.StandardOutput.ReadToEndAsync()
    $smokeStderrTask = $smokeChild.StandardError.ReadToEndAsync()
    try {
        $smokeChild.StandardInput.NewLine = "`n"
        $smokeChild.StandardInput.WriteLine($smokePlain)
        $smokeChild.StandardInput.Close()
    } finally {
        $smokePlain = $null
        if ($smokeBstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($smokeBstr)
            $smokeBstr = [IntPtr]::Zero
        }
        if ($null -ne $smokeSecret) { $smokeSecret.Dispose(); $smokeSecret = $null }
    }

    if (-not $smokeChild.WaitForExit(60000)) {
        $smokeChild.Kill()
        throw 'Driver deadline exceeded'
    }
    $smokeDrainTask = [Threading.Tasks.Task]::WhenAll([Threading.Tasks.Task[]]@($smokeStdoutTask, $smokeStderrTask))
    if (-not $smokeDrainTask.Wait(5000)) { throw 'Driver output deadline exceeded' }
    [Console]::Out.Write($smokeStdoutTask.Result)
    [Console]::Error.Write($smokeStderrTask.Result)
    $smokeExitCode = $smokeChild.ExitCode
    [Console]::Out.WriteLine("ExitCode: $smokeExitCode")
} catch {
    [Console]::Error.WriteLine('Research smoke launcher stopped (launcher-failed).')
    [Console]::Error.WriteLine('ExitCode: 1')
} finally {
    $smokePlain = $null
    if ($smokeBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($smokeBstr) }
    if ($null -ne $smokeSecret) { $smokeSecret.Dispose() }
    if ($null -ne $smokeChild) {
        try { if (-not $smokeChild.HasExited) { $smokeChild.Kill() } } catch { }
        $smokeChild.Dispose()
    }
}

exit $smokeExitCode

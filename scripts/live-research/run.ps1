[CmdletBinding()]
param([switch]$ExecuteOne, [switch]$CheckKeyOnly, [switch]$CheckAccountOnly, [switch]$ProbeMinimal)

if (($ExecuteOne -and $CheckKeyOnly) -or ($ExecuteOne -and $CheckAccountOnly) -or ($CheckKeyOnly -and $CheckAccountOnly) -or ($ProbeMinimal -and ($ExecuteOne -or $CheckKeyOnly -or $CheckAccountOnly))) {
    [Console]::Error.WriteLine('Live validation stopped (launcher-mode-conflict).')
    exit 1
}

$ErrorActionPreference = 'Stop'
$validationExitCode = 1
$validationSecret = $null
$validationPlain = $null
$validationBstr = [IntPtr]::Zero
$validationChild = $null
$validationStdoutTask = $null
$validationStderrTask = $null
$validationLauncherTimeoutMs = 180000

try {
    $validationRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
    $validationUsesLocalProfile = -not ($CheckKeyOnly -or $CheckAccountOnly -or $ProbeMinimal)
    if ($validationUsesLocalProfile) {
        $validationProfilePath = Join-Path $validationRoot 'app/server/research/local-validation-profile.json'
        if (-not (Test-Path -LiteralPath $validationProfilePath -PathType Leaf)) { throw 'Invalid local validation profile' }
        # The shared profile is UTF-8 without a BOM; reject decoding errors and JSON extensions before parsing.
        $validationUtf8 = [Text.UTF8Encoding]::new($false, $true)
        $validationProfileJson = $validationUtf8.GetString([IO.File]::ReadAllBytes($validationProfilePath))
        $validationJsonWhitespace = '[ \t\r\n]*'
        $validationJsonString = '"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"'
        $validationJsonNumber = '-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?'
        $validationJsonPair = $validationJsonString + $validationJsonWhitespace + ':' + $validationJsonWhitespace + '(?:' + $validationJsonString + '|' + $validationJsonNumber + ')'
        # Exactly eight flat pairs also prevents duplicate members from being hidden by ConvertFrom-Json.
        $validationJsonPattern = '\A' + $validationJsonWhitespace + '\{' + $validationJsonWhitespace + $validationJsonPair + '(?:' + $validationJsonWhitespace + ',' + $validationJsonWhitespace + $validationJsonPair + '){7}' + $validationJsonWhitespace + '\}' + $validationJsonWhitespace + '\z'
        if (-not [Text.RegularExpressions.Regex]::IsMatch($validationProfileJson, $validationJsonPattern, [Text.RegularExpressions.RegexOptions]::None, [TimeSpan]::FromSeconds(1))) {
            throw 'Invalid local validation profile'
        }
        $validationProfile = $validationProfileJson | ConvertFrom-Json -ErrorAction Stop
        $validationExpectedProperties = @('profileId', 'model', 'reasoningEffort', 'maxOutputTokens', 'outputPolicyVersion', 'researchTimeoutMs', 'activeTtlMs', 'launcherTimeoutMs')
        $validationActualProperties = @($validationProfile.PSObject.Properties | ForEach-Object { $_.Name })
        if ($validationActualProperties.Count -ne $validationExpectedProperties.Count) { throw 'Invalid local validation profile' }
        foreach ($validationExpectedProperty in $validationExpectedProperties) {
            if (@($validationActualProperties | Where-Object { $_ -ceq $validationExpectedProperty }).Count -ne 1) {
                throw 'Invalid local validation profile'
            }
        }
        if (($validationProfile.profileId -isnot [string]) -or ($validationProfile.profileId -cne 'kimi-low-output32k-v3')) { throw 'Invalid local validation profile' }
        if (($validationProfile.model -isnot [string]) -or ($validationProfile.model -cne 'moonshotai/kimi-k3')) { throw 'Invalid local validation profile' }
        if (($validationProfile.reasoningEffort -isnot [string]) -or ($validationProfile.reasoningEffort -cne 'low')) { throw 'Invalid local validation profile' }
        if (($validationProfile.outputPolicyVersion -isnot [string]) -or ($validationProfile.outputPolicyVersion -cne 'kimi-complete-quality-v2')) { throw 'Invalid local validation profile' }
        foreach ($validationNumericProperty in @('maxOutputTokens', 'researchTimeoutMs', 'activeTtlMs', 'launcherTimeoutMs')) {
            $validationNumericValue = $validationProfile.$validationNumericProperty
            if (($validationNumericValue -isnot [ValueType]) -or ($validationNumericValue -is [bool]) -or ($validationNumericValue -is [char])) {
                throw 'Invalid local validation profile'
            }
            $validationNumericDouble = [double]$validationNumericValue
            if ([double]::IsNaN($validationNumericDouble) -or [double]::IsInfinity($validationNumericDouble) -or ([Math]::Floor($validationNumericDouble) -ne $validationNumericDouble)) {
                throw 'Invalid local validation profile'
            }
        }
        if ($validationProfile.maxOutputTokens -ne 32768) { throw 'Invalid local validation profile' }
        if ($validationProfile.researchTimeoutMs -ne 1200000) { throw 'Invalid local validation profile' }
        if ($validationProfile.activeTtlMs -ne 1260000) { throw 'Invalid local validation profile' }
        if ($validationProfile.launcherTimeoutMs -ne 1320000) { throw 'Invalid local validation profile' }
        if (($validationProfile.researchTimeoutMs -ge $validationProfile.activeTtlMs) -or ($validationProfile.activeTtlMs -ge $validationProfile.launcherTimeoutMs)) {
            throw 'Invalid local validation profile'
        }
        $validationLauncherTimeoutMs = [int]$validationProfile.launcherTimeoutMs
    }
    $validationNode = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    if ($ExecuteOne -or $CheckKeyOnly -or $CheckAccountOnly -or $ProbeMinimal) {
        if ([Console]::IsInputRedirected) { throw 'Interactive terminal required' }
        if ($ProbeMinimal) {
            Write-Host 'One minimal inference request: moonshotai/kimi-k3; 512 output tokens; no search or JSON schema; privacy restrictions retained; dedicated unused USD 5 key; no repair or retry.'
        } elseif ($CheckAccountOnly) {
            Write-Host 'Read-only account check: key GET and model-catalog GET with the existing dedicated limited test key (USD 5 cap); no Research request.'
        } elseif ($CheckKeyOnly) {
            Write-Host 'Key-only check: one key GET; no Research request. Dedicated unused USD 5 key required.'
        } else {
            Write-Host 'One live Research request: moonshotai/kimi-k3; reasoning low; 32768 output tokens; Provider deadline 20 minutes; launcher total deadline 22 minutes; dedicated unused USD 5 key; no repair or retry.'
        }
        $validationSecret = Read-Host 'Paste dedicated OpenRouter key (masked)' -AsSecureString
        $validationBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($validationSecret)
        $validationPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($validationBstr)
        if ($validationPlain -cnotmatch '^[A-Za-z0-9._-]{1,512}$') { throw 'Invalid key' }
    } else {
        Write-Host 'Offline dry-run: profile kimi-low-output32k-v3; moonshotai/kimi-k3; reasoning low; 32768 output tokens; Provider deadline 20 minutes; launcher total deadline 22 minutes; authored fixture only; 0 real requests.'
    }

    $validationStart = [Diagnostics.ProcessStartInfo]::new()
    $validationStart.FileName = $validationNode
    $validationStart.WorkingDirectory = $validationRoot
    $validationStart.Arguments = 'scripts/live-research/runner.mjs'
    if ($ExecuteOne) { $validationStart.Arguments += ' --execute-one' }
    if ($CheckKeyOnly) { $validationStart.Arguments += ' --check-key-only' }
    if ($CheckAccountOnly) { $validationStart.Arguments += ' --check-account-only' }
    if ($ProbeMinimal) { $validationStart.Arguments += ' --probe-minimal' }
    $validationStart.UseShellExecute = $false
    $validationStart.CreateNoWindow = $true
    $validationStart.RedirectStandardInput = $true
    $validationStart.RedirectStandardOutput = $true
    $validationStart.RedirectStandardError = $true
    # The child receives the entered key solely through its anonymous stdin pipe.
    $validationStart.EnvironmentVariables.Remove('OPENROUTER_API_KEY')
    $validationStart.EnvironmentVariables.Remove('NODE_OPTIONS')
    $validationChild = [Diagnostics.Process]::new()
    $validationChild.StartInfo = $validationStart
    $validationStopwatch = [Diagnostics.Stopwatch]::StartNew()
    [void]$validationChild.Start()
    $validationStdoutTask = $validationChild.StandardOutput.ReadToEndAsync()
    $validationStderrTask = $validationChild.StandardError.ReadToEndAsync()
    try {
        if ($ExecuteOne -or $CheckKeyOnly -or $CheckAccountOnly -or $ProbeMinimal) { $validationChild.StandardInput.Write($validationPlain) }
        $validationChild.StandardInput.Close()
    } finally {
        $validationPlain = $null
        if ($validationBstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($validationBstr)
            $validationBstr = [IntPtr]::Zero
        }
        if ($null -ne $validationSecret) { $validationSecret.Dispose(); $validationSecret = $null }
    }
    $validationRemainingMs = [Math]::Max(0, $validationLauncherTimeoutMs - [int]$validationStopwatch.ElapsedMilliseconds)
    if (($validationRemainingMs -le 0) -or (-not $validationChild.WaitForExit($validationRemainingMs))) {
        $validationChild.Kill()
        throw 'Validation deadline exceeded'
    }
    $validationRemainingMs = [Math]::Max(0, $validationLauncherTimeoutMs - [int]$validationStopwatch.ElapsedMilliseconds)
    $validationDrainTask = [Threading.Tasks.Task]::WhenAll([Threading.Tasks.Task[]]@($validationStdoutTask, $validationStderrTask))
    if (($validationRemainingMs -le 0) -or (-not $validationDrainTask.Wait($validationRemainingMs))) {
        throw 'Validation output deadline exceeded'
    }
    [Console]::Out.Write($validationStdoutTask.Result)
    [Console]::Error.Write($validationStderrTask.Result)
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

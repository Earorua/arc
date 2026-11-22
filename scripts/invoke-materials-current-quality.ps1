#requires -Version 7.2
[CmdletBinding(DefaultParameterSetName='Check')]
param(
    [Parameter(ParameterSetName='Check')][switch]$CheckOnly,
    [Parameter(ParameterSetName='Live',Mandatory)][switch]$ExecuteApproved,
    [string]$PacketId,
    [string]$PacketSha256
)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodeExe='C:\Program Files\nodejs\node.exe'
$secureKey=$null;$exitCode=2
$failureReason='invalid-packet'
$messages=@{
    'invalid-packet'='Check the separately issued packet, digest and private file permissions.'
    'approval-window'='Obtain a fresh approval window; this command cannot renew it.'
    'source-drift'='Source, body or evidence pins changed; review and freeze the packet again.'
    'route-unavailable'='Check the public endpoint and strict ZDR catalogues for the reviewed Modal route and prices.'
    'account-evidence'='Refresh the independently reviewed Credits and guardrail evidence.'
    'key-readback'='Inspect the dedicated key metadata and its active restrictions.'
    'key-mismatch'='Use the dedicated key bound to the approved packet.'
    'insufficient-funds'='The verified allowance is insufficient; no limit change is automatic.'
    'used-slot'='This run already started. Preserve its evidence and do not repeat it.'
    'ledger-unresolved'='Check the pinned six-document ledger and reconcile its open or held run.'
    'collection-stopped'='Collection or capture is incomplete. Preserve the ledgers; do not retry inference.'
    'local-write'='Check private output permissions and retain existing evidence.'
}
function Invoke-CurrentOperator([string]$mode,[Security.SecureString]$credential) {
    $psi=[Diagnostics.ProcessStartInfo]::new();$child=$null
    try {
        $psi.FileName=$nodeExe;$psi.WorkingDirectory=$taskRoot;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
        $psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true;$psi.Environment.Clear()
        foreach($name in 'SystemRoot','PATH','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','ComSpec','SystemDrive') {
            $value=[Environment]::GetEnvironmentVariable($name);if($value){$psi.Environment[$name]=$value}
        }
        foreach($argument in '--import','tsx','scripts/materials-current-quality-operator.ts',$mode){$psi.ArgumentList.Add($argument)}
        if($mode -ne '--inspect-account'){foreach($argument in $PacketId,$PacketSha256){$psi.ArgumentList.Add($argument)}}
        if($credential){$psi.Environment['ARC_CURRENT_MATERIALS_KEY']=[Net.NetworkCredential]::new('', $credential).Password}
        $child=[Diagnostics.Process]::Start($psi)
        $null=$psi.Environment.Remove('ARC_CURRENT_MATERIALS_KEY')
        $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
        $child.WaitForExit()
        $output=$stdout.GetAwaiter().GetResult();$null=$stderr.GetAwaiter().GetResult()
        # Only the fixed host's bounded summary is printed; stderr and exceptions are never echoed.
        if($output.Length -gt 4096){throw 'Unexpected operator output'}
        if($child.ExitCode -ne 0) {
            try {$report=$output|ConvertFrom-Json;if($report.status -eq 'refused' -and $messages.ContainsKey([string]$report.reason)){$script:failureReason=[string]$report.reason}} catch {}
            throw 'Operator refused or stopped'
        }
        Write-Host $output.Trim()
    } finally { $psi.Environment.Clear();if($child){$child.Dispose()} }
}
try {
    $operation='--inspect-account'
    if($ExecuteApproved -or $PacketId -or $PacketSha256) {
        if($PacketId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$' -or $PacketSha256 -notmatch '^[a-f0-9]{64}$'){throw 'A separately approved packet and digest are required'}
        Invoke-CurrentOperator '--verify' $null
        $operation=if($ExecuteApproved){'--execute'}else{'--check'}
    } else { Write-Host 'Read-only account inspection: one GET /key, no approval, startup slot or inference request.' }
    $failureReason='key-readback'
    Write-Host 'Only the dedicated materials key is accepted. Input stays hidden and in process memory.'
    $secureKey=Read-Host 'Enter the dedicated materials key (hidden)' -AsSecureString
    if(!$secureKey -or $secureKey.Length -eq 0){throw 'No credential supplied'}
    if($ExecuteApproved) {
        Write-Host 'Executing the separately approved 24, then six, once. Keep this terminal open; do not repeat the command.'
    }
    Invoke-CurrentOperator $operation $secureKey
    Write-Host 'Finished. Read-only metadata is not account Credits proof or paid authorization; no model qualification or release is approved.'
    $exitCode=0
} catch {
    Write-Host ('Current quality operator refused or stopped ['+$failureReason+']. '+$messages[$failureReason])
} finally { if($secureKey){$secureKey.Dispose();$secureKey=$null} }
exit $exitCode

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$statePath = Join-Path $projectRoot '.runtime/web-process.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Output 'No owned website process recorded.'; exit 0 }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
if ($process) {
    $command = Get-CimInstance Win32_Process -Filter "ProcessId=$($state.pid)"
    if ($process.Path -ne $state.node -or $command.CommandLine -notlike "*$($state.vite)*" -or [Math]::Abs(($process.StartTime.ToUniversalTime() - [datetime]$state.started).TotalSeconds) -gt 1) { throw 'The recorded process no longer matches this website. No process was stopped.' }
    Stop-Process -Id $state.pid
}
Remove-Item -LiteralPath $statePath
Write-Output 'CareFlow website stopped. The backend continues running.'

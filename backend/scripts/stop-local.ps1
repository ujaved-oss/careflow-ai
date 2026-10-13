param([ValidateSet('all','worker')][string]$ServiceSelection = 'all')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot '.runtime'
$serviceFile = Join-Path $runtimeRoot 'services.json'
if (Test-Path -LiteralPath $serviceFile) {
    $services = Get-Content -LiteralPath $serviceFile -Raw | ConvertFrom-Json
    foreach ($service in $services) {
        if ($ServiceSelection -eq 'worker' -and $service.name -ne 'worker') { continue }
        # Windows venv launchers spawn the real interpreter as a child process.
        $moduleName = if ($service.name -eq 'api') { 'uvicorn careflow.main:app' } else { 'careflow.worker' }
        $ownedChildFound = $false
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($service.processId)")
        foreach ($child in $children) {
            if ($child.CommandLine -and $child.CommandLine.Contains($service.executable) -and $child.CommandLine.Contains($moduleName)) {
                Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
                $ownedChildFound = $true
            }
        }
        if ($ownedChildFound) {
            foreach ($child in $children) {
                if ($child.Name -eq 'conhost.exe') { Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue }
            }
        }
        $serviceProcess = Get-Process -Id $service.processId -ErrorAction SilentlyContinue
        if ($serviceProcess -and $serviceProcess.Path -eq $service.executable -and $serviceProcess.StartTime.ToUniversalTime() -eq ([datetime]$service.startedAt).ToUniversalTime()) {
            Stop-Process -Id $service.processId -ErrorAction SilentlyContinue
        }
    }
}
$pgDataPath = Join-Path $runtimeRoot 'pgdata'
$pgControl = Join-Path $runtimeRoot 'package\native\bin\pg_ctl.exe'
if ($ServiceSelection -eq 'all' -and (Test-Path -LiteralPath $pgControl) -and (Test-Path -LiteralPath (Join-Path $pgDataPath 'postmaster.pid'))) {
    & $pgControl stop -D $pgDataPath -m fast -w
    if ($LASTEXITCODE) { throw 'PostgreSQL shutdown failed' }
}
if ($ServiceSelection -eq 'worker') { Write-Host 'CareFlow worker stopped; API and database retained.' }
else { Write-Host 'CareFlow local services stopped; database retained.' }

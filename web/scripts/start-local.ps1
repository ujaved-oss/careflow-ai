param([int]$Port = 5173)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$nodePath = (Get-Command node.exe).Source
$npmCli = Join-Path (Split-Path $nodePath -Parent) 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/vite/bin/vite.js'))) {
    Push-Location $projectRoot
    try { & $nodePath $npmCli install; if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' } }
    finally { Pop-Location }
}
$runtime = Join-Path $projectRoot '.runtime'
$null = New-Item -ItemType Directory -Force -Path $runtime
try { $null = Invoke-WebRequest 'http://127.0.0.1:8788/team-api/auth/demo-users' -TimeoutSec 2 } catch {
    $teamPath = Join-Path $projectRoot 'server/local.js'
    $teamProcess = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $teamPath + '"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'team.out.log') -RedirectStandardError (Join-Path $runtime 'team.err.log') -PassThru
    @{pid=$teamProcess.Id;started=$teamProcess.StartTime.ToUniversalTime().ToString('o');port=8788} | ConvertTo-Json | Set-Content (Join-Path $runtime 'team-process.json')
    $teamReady = $false
    for ($attempt=0; $attempt -lt 30; $attempt++) { Start-Sleep -Milliseconds 250; try { $null = Invoke-WebRequest 'http://127.0.0.1:8788/team-api/auth/demo-users' -TimeoutSec 1; $teamReady = $true; break } catch {} }
    if (-not $teamReady) { throw "The shared team server did not start. Inspect $runtime/team.err.log." }
}
try {
    $null = Invoke-WebRequest "http://127.0.0.1:$Port/" -TimeoutSec 2
    Write-Output "CareFlow website is already available at http://127.0.0.1:$Port/"
    exit 0
} catch {}
$vitePath = Join-Path $projectRoot 'node_modules/vite/bin/vite.js'
$viteArgument = '"' + $vitePath + '"'
$process = Start-Process -FilePath $nodePath -ArgumentList @($viteArgument, '--host', '127.0.0.1', '--port', "$Port", '--strictPort') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'web.out.log') -RedirectStandardError (Join-Path $runtime 'web.err.log') -PassThru
@{pid=$process.Id;started=$process.StartTime.ToUniversalTime().ToString('o');node=$nodePath;vite=$vitePath;port=$Port} | ConvertTo-Json | Set-Content (Join-Path $runtime 'web-process.json')
for ($attempt=0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 250
    try { $null = Invoke-WebRequest "http://127.0.0.1:$Port/" -TimeoutSec 1; Write-Output "CareFlow website: http://127.0.0.1:$Port/"; exit 0 } catch {}
}
throw "The website did not start. Inspect $runtime/web.err.log."

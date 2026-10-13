param([int]$ApiPort = 8000, [int]$DatabasePort = 55432)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot '.runtime'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
Set-Location -LiteralPath $projectRoot
$existingServices = Join-Path $runtimeRoot 'services.json'
if (Test-Path -LiteralPath $existingServices) {
    foreach ($service in (Get-Content -LiteralPath $existingServices -Raw | ConvertFrom-Json)) {
        $existingProcess = Get-Process -Id $service.processId -ErrorAction SilentlyContinue
        if ($existingProcess -and $existingProcess.Path -eq $service.executable -and $existingProcess.StartTime.ToUniversalTime() -eq ([datetime]$service.startedAt).ToUniversalTime()) { throw 'CareFlow services already run; use stop-local.ps1 before restarting' }
    }
}
$activeListeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
if ($activeListeners.Port -contains $ApiPort) { throw "API port $ApiPort is occupied; select another ApiPort" }
$ownClusterFile = Join-Path $runtimeRoot 'pgdata\postmaster.pid'
if (($activeListeners.Port -contains $DatabasePort) -and -not (Test-Path -LiteralPath $ownClusterFile)) { throw "Database port $DatabasePort is occupied; select another DatabasePort" }
$pythonBootstrap = Join-Path $runtimeRoot 'bootstrap\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonBootstrap)) {
    python -m venv (Join-Path $runtimeRoot 'bootstrap')
    if ($LASTEXITCODE) { throw 'Python 3.12+ is required' }
    & $pythonBootstrap -m pip install 'uv==0.13.0'
    if ($LASTEXITCODE) { throw 'uv installation failed' }
}
& $pythonBootstrap -m uv sync --frozen --extra dev
if ($LASTEXITCODE) { throw 'Dependency installation failed' }
$pythonRuntime = Join-Path $projectRoot '.venv\Scripts\python.exe'
$nativeRoot = Join-Path $runtimeRoot 'package\native'
$postgresExe = Join-Path $nativeRoot 'bin\postgres.exe'
if (-not (Test-Path -LiteralPath $postgresExe)) {
    $archivePath = Join-Path $runtimeRoot 'postgres-16.14.tgz'
    Invoke-WebRequest -Uri 'https://registry.npmjs.org/@embedded-postgres/windows-x64/-/windows-x64-16.14.0-beta.17.tgz' -OutFile $archivePath
    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
    if ($archiveHash -ne '9249F5D366D332D8023D32699F8667954A6D97D6B2F5CCDF25384D65B9A15582') { throw 'PostgreSQL archive checksum mismatch' }
    tar -xzf $archivePath -C $runtimeRoot
    if ($LASTEXITCODE) { throw 'PostgreSQL extraction failed' }
}
$pgDataPath = Join-Path $runtimeRoot 'pgdata'
if (-not (Test-Path -LiteralPath (Join-Path $pgDataPath 'PG_VERSION'))) {
    & (Join-Path $nativeRoot 'bin\initdb.exe') -D $pgDataPath -U careflow -A trust --encoding=UTF8 --locale=C
    if ($LASTEXITCODE) { throw 'PostgreSQL initialization failed' }
}
if (-not (Test-Path -LiteralPath (Join-Path $pgDataPath 'postmaster.pid'))) {
    $pgProcess = Start-Process -FilePath $postgresExe -ArgumentList "-D `"$pgDataPath`" -p $DatabasePort -h 127.0.0.1" -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot 'postgres.out.log') -RedirectStandardError (Join-Path $runtimeRoot 'postgres.error.log')
    Set-Content -LiteralPath (Join-Path $runtimeRoot 'postgres.pid') -Value $pgProcess.Id
}
$env:DATABASE_URL = "postgresql+asyncpg://careflow@127.0.0.1:$DatabasePort/careflow"
& $pythonRuntime (Join-Path $PSScriptRoot 'prepare_local_database.py') --port $DatabasePort
if ($LASTEXITCODE) { throw 'Database preparation failed' }
& $pythonRuntime -m alembic upgrade head
if ($LASTEXITCODE) { throw 'Database migration failed' }
& $pythonRuntime -m careflow.seed
if ($LASTEXITCODE) { throw 'Synthetic seed failed' }
$serviceRecords = @()
foreach ($serviceName in @('api','worker')) {
    if ($serviceName -eq 'api') { $serviceArguments = "-m uvicorn careflow.main:app --host 127.0.0.1 --port $ApiPort" }
    else { $serviceArguments = '-m careflow.worker' }
    $serviceProcess = Start-Process -FilePath $pythonRuntime -ArgumentList $serviceArguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot "$serviceName.out.log") -RedirectStandardError (Join-Path $runtimeRoot "$serviceName.error.log")
    $serviceRecords += [pscustomobject]@{name=$serviceName; processId=$serviceProcess.Id; executable=$pythonRuntime; startedAt=$serviceProcess.StartTime.ToUniversalTime().ToString('o')}
}
$serviceRecords | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot 'services.json')
Write-Host "Synthetic CareFlow AI API: http://127.0.0.1:$ApiPort/docs"
Write-Host 'Use scripts/stop-local.ps1 to stop these services. Local PostgreSQL binds to loopback and uses demo-only trust authentication.'

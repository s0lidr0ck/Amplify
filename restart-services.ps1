# Restart Amplify API and Web dev services
# Stops processes on ports 8000 (API) and 3000 (web), then starts both
# Tip: Close any existing API/Web terminal windows first to avoid stale processes

$ErrorActionPreference = "Continue"
$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

function Stop-Port {
  param([int]$Port, [int]$MaxIterations = 10)
  $iter = 0
  while ($iter -lt $MaxIterations) {
    $killed = $false
    try {
      $lines = @(netstat -ano 2>$null | Select-String ":$Port\s+.*LISTENING")
      $pidsToKill = @()
      foreach ($line in $lines) {
        $parts = ($line -split '\s+')
        $targetPid = $parts[-1]
        if ($targetPid -match '^\d+$' -and [int]$targetPid -ne $PID) {
          $pidsToKill += [int]$targetPid
          $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$targetPid" -ErrorAction SilentlyContinue
          if ($proc -and $proc.ParentProcessId -and $proc.ParentProcessId -ne 0 -and $proc.ParentProcessId -ne $PID) {
            $pidsToKill += $proc.ParentProcessId
          }
        }
      }
      foreach ($p in ($pidsToKill | Select-Object -Unique)) {
        taskkill /F /PID $p 2>$null | Out-Null
        Write-Host "Stopped process $p on port $Port"
        $killed = $true
      }
      if (-not $killed) { break }
      Start-Sleep -Seconds 2
      $iter++
    } catch { Write-Host "Note: could not check port $Port"; break }
  }
}

function Test-PortFree {
  param([int]$Port)
  $lines = @(netstat -ano 2>$null | Select-String ":$Port\s+.*LISTENING")
  return ($lines.Count -eq 0)
}


function Wait-PortFree {
  param([int]$Port, [int]$MaxWaitSeconds = 15)
  $waited = 0
  while ($waited -lt $MaxWaitSeconds) {
    if (Test-PortFree $Port) { return $true }
    Start-Sleep -Seconds 1
    $waited++
  }
  return $false
}

Write-Host "Stopping services..."
Stop-Port 8000
Stop-Port 3000
Stop-Port 8001
Stop-Port 8002

Write-Host "Finding free API port..."
$apiPort = $null
foreach ($p in 8000, 8001, 8002, 8003, 8004, 8005) {
  if (Test-PortFree $p) { $apiPort = $p; break }
}
if (-not $apiPort) { $apiPort = 8006; Write-Host "Ports 8000-8005 in use - using $apiPort" }
if ($apiPort -ne 8000) { Write-Host "Using port $apiPort (8000 was busy)" }
if (-not (Test-PortFree 3000)) { Write-Host "WARNING: Port 3000 may still be in use" }
Start-Sleep -Seconds 2

# Single startup path: cd to API dir (matches docs/local-dev-no-docker.md)
# Use --no-reload so one process per port; restart script fully replaces it each run
$apiCmd = "Set-Location '$root\services\api'; python -m uvicorn app.main:app --port $apiPort"
$webCmd = "Set-Location '$root\apps\web'; `$env:NEXT_PUBLIC_API_URL='http://localhost:$apiPort'; npm run dev"
$workerCmd = "Set-Location '$root\services\worker'; `$env:API_URL='http://localhost:$apiPort'; pip install -e . 2>`$null; python run.py"

Write-Host "Starting API (port $apiPort)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", $apiCmd

Start-Sleep -Seconds 2

Write-Host "Starting Web (port 3000)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", $webCmd

Start-Sleep -Seconds 2

$envFile = Join-Path $root ".env"
$skipWorker = $false
if (Test-Path $envFile) {
  $envContent = Get-Content $envFile -Raw
  if ($envContent -match 'SYNC_TRIM_DEV\s*=\s*true') { $skipWorker = $true }
}
if ($skipWorker) {
  Write-Host "Skipping Worker (SYNC_TRIM_DEV=true in .env)"
} else {
  Write-Host "Starting Worker (requires Redis on localhost:6379)..."
  Write-Host "  No Redis? Add SYNC_TRIM_DEV=true to .env for instant trim without worker."
  Start-Process powershell -ArgumentList "-NoExit", "-Command", $workerCmd
}

Write-Host "Done. API on port $apiPort, Web on 3000."
Read-Host "Press Enter to close"

$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

$env:ELECTRON_MIRROR = if ($env:ELECTRON_MIRROR) {
  $env:ELECTRON_MIRROR
} else {
  'https://npmmirror.com/mirrors/electron/'
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  Write-Host '没有找到 Node.js，无法启动 ResearchNotion。' -ForegroundColor Red
  exit 1
}
$nodeExecutable = [string]$nodeCommand.Source

$electronViteScript = Join-Path $projectRoot 'node_modules\electron-vite\bin\electron-vite.js'
$electronViteLauncher = Join-Path $projectRoot 'node_modules\.bin\electron-vite.CMD'

Write-Host ''
Write-Host 'ResearchNotion local launcher' -ForegroundColor Cyan
Write-Host "Project: $projectRoot"
Write-Host "Mirror:  $env:ELECTRON_MIRROR"
Write-Host ''

$requiredDependencies = @(
  $electronViteScript
  $electronViteLauncher
  (Join-Path $projectRoot 'node_modules\electron\dist\electron.exe')
  (Join-Path $projectRoot 'node_modules\pdfjs-dist\package.json')
  (Join-Path $projectRoot 'node_modules\better-sqlite3\build\Release\better_sqlite3.node')
)
$missingDependencies = @($requiredDependencies | Where-Object { -not (Test-Path -LiteralPath $_) })

if ($missingDependencies.Count -gt 0) {
  Write-Host '项目依赖不完整，ResearchNotion 尚未启动。缺少：' -ForegroundColor Red
  $missingDependencies | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  Write-Host ''
  Write-Host '为避免破坏已有环境，启动脚本不会自动运行 pnpm install。请先修复依赖。' -ForegroundColor Yellow
  exit 1
}

function Test-Dify {
  try {
    $response = Invoke-WebRequest -Uri 'http://localhost:8080/console/api/system-features' -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  } catch {
    return $false
  }
}

if (-not (Test-Dify)) {
  $difyStartScript = Join-Path $projectRoot 'scripts\start-dify.ps1'
  if (Test-Path -LiteralPath $difyStartScript) {
    Write-Host 'Dify is not responding. Trying to start local Dify in the background...' -ForegroundColor Yellow
    & powershell -NoProfile -ExecutionPolicy Bypass -File $difyStartScript -NoOpen
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'Dify startup did not complete. ResearchNotion will still open; configure or start Dify when you need AI features.' -ForegroundColor Yellow
    } elseif (Test-Dify) {
      Write-Host 'Dify is ready at http://localhost:8080.' -ForegroundColor Green
    } else {
      Write-Host 'Dify startup returned, but the service is not responding yet. Docker may still be warming up.' -ForegroundColor Yellow
    }
  } else {
    Write-Host "Dify startup script was not found: $difyStartScript" -ForegroundColor Yellow
  }
} else {
  Write-Host 'Dify already responds at http://localhost:8080.' -ForegroundColor Green
}

function Test-DeepSeekBridge {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:17778/health' -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-DeepSeekBridge)) {
  Write-Host 'Starting local DeepSeek bridge for Dify...' -ForegroundColor Yellow
  $deepSeekBridgeScript = Join-Path $projectRoot 'scripts\deepseek-bridge.mjs'
  Start-Process `
    -FilePath 'powershell' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "Set-Location '$projectRoot'; node '$deepSeekBridgeScript'") `
    -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds(15)
  do {
    if (Test-DeepSeekBridge) {
      Write-Host 'DeepSeek bridge is ready at http://127.0.0.1:17778/health.' -ForegroundColor Green
      break
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)

  if (-not (Test-DeepSeekBridge)) {
    Write-Host 'DeepSeek bridge did not respond yet; Dify model calls may fail until it starts.' -ForegroundColor Yellow
  }
} else {
  Write-Host 'DeepSeek bridge already responds at http://127.0.0.1:17778/health.' -ForegroundColor Green
}

Write-Host 'Checking native modules for Electron...' -ForegroundColor Yellow
& node (Join-Path $projectRoot 'scripts\ensure-electron-native.cjs')
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host 'Starting ResearchNotion...' -ForegroundColor Green
Write-Host 'Close the Electron window or press Ctrl+C in this terminal to stop it.'
Write-Host ''

node $electronViteScript
exit $LASTEXITCODE

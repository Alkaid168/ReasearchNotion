$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

$env:ELECTRON_MIRROR = if ($env:ELECTRON_MIRROR) {
  $env:ELECTRON_MIRROR
} else {
  'https://npmmirror.com/mirrors/electron/'
}

$pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
$codexPnpm = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd'
$corepackCommand = Get-Command corepack -ErrorAction SilentlyContinue

if ($pnpmCommand) {
  $pnpmFile = $pnpmCommand.Source
  $pnpmPrefixArgs = @()
  $pnpmDisplay = $pnpmCommand.Source
} elseif (Test-Path $codexPnpm) {
  $pnpmFile = $codexPnpm
  $pnpmPrefixArgs = @()
  $pnpmDisplay = $codexPnpm
} elseif ($corepackCommand) {
  $pnpmFile = $corepackCommand.Source
  $pnpmPrefixArgs = @('pnpm')
  $pnpmDisplay = "$($corepackCommand.Source) pnpm"
} else {
  Write-Host 'pnpm was not found. Please install pnpm first:' -ForegroundColor Red
  Write-Host '  npm install -g pnpm'
  exit 1
}

function Invoke-Pnpm {
  param([string[]]$Arguments = @())
  & $pnpmFile @pnpmPrefixArgs @Arguments
}

function Get-PnpmCommandText {
  param([string[]]$Arguments = @())
  return "& '$pnpmFile' $((@($pnpmPrefixArgs) + @($Arguments)) -join ' ')"
}

Write-Host ''
Write-Host 'ResearchNotion local launcher' -ForegroundColor Cyan
Write-Host "Project: $projectRoot"
Write-Host "pnpm:    $pnpmDisplay"
Write-Host "Mirror:  $env:ELECTRON_MIRROR"
Write-Host ''

if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
  Write-Host 'node_modules not found. Installing dependencies...' -ForegroundColor Yellow
  Invoke-Pnpm -Arguments @('install')
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

function Test-Dify {
  try {
    $response = Invoke-WebRequest -Uri 'http://localhost:8080' -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
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
  Start-Process `
    -FilePath 'powershell' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "Set-Location '$projectRoot'; $(Get-PnpmCommandText -Arguments @('deepseek:bridge'))") `
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

Write-Host 'Rebuilding native modules for Electron...' -ForegroundColor Yellow
Invoke-Pnpm -Arguments @('exec', 'electron-rebuild', '-f', '-w', 'better-sqlite3')
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host 'Starting ResearchNotion...' -ForegroundColor Green
Write-Host 'Close the Electron window or press Ctrl+C in this terminal to stop it.'
Write-Host ''

Invoke-Pnpm -Arguments @('exec', 'electron-vite', 'dev')
exit $LASTEXITCODE

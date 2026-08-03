param(
  [switch]$DryRun,
  [switch]$SkipDifyStart
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

$env:ELECTRON_MIRROR = if ($env:ELECTRON_MIRROR) {
  $env:ELECTRON_MIRROR
} else {
  'https://npmmirror.com/mirrors/electron/'
}

function Find-Pnpm {
  $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
  $codexPnpm = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd'
  $corepackCommand = Get-Command corepack -ErrorAction SilentlyContinue

  if ($pnpmCommand) {
    return @{
      FilePath = $pnpmCommand.Source
      PrefixArgs = @()
      Display = $pnpmCommand.Source
    }
  }

  if (Test-Path -LiteralPath $codexPnpm) {
    return @{
      FilePath = $codexPnpm
      PrefixArgs = @()
      Display = $codexPnpm
    }
  }

  if ($corepackCommand) {
    return @{
      FilePath = $corepackCommand.Source
      PrefixArgs = @('pnpm')
      Display = "$($corepackCommand.Source) pnpm"
    }
  }

  Write-Host 'pnpm was not found. Please install pnpm first:' -ForegroundColor Red
  Write-Host '  npm install -g pnpm'
  exit 1
}

function Join-PnpmArguments {
  param([string[]]$Arguments = @())
  return @($pnpm.PrefixArgs) + @($Arguments)
}

function Get-PnpmCommandText {
  param([string[]]$Arguments = @())
  return "& '$($pnpm.FilePath)' $((Join-PnpmArguments -Arguments $Arguments) -join ' ')"
}

function Invoke-Step {
  param(
    [string]$Label,
    [string]$DisplayCommand,
    [string]$FilePath,
    [string[]]$Arguments = @()
  )

  Write-Host ''
  Write-Host "==> $Label" -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host "DRY RUN: $DisplayCommand"
    return
  }

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

function Invoke-PnpmScript {
  param(
    [string]$Label,
    [string]$ScriptName
  )

  Invoke-Step -Label $Label -DisplayCommand "pnpm $ScriptName" -FilePath $pnpm.FilePath -Arguments (Join-PnpmArguments -Arguments @($ScriptName))
}

function Stop-ProjectDevProcesses {
  Write-Host ''
  Write-Host '==> Stop existing ResearchNotion dev processes' -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host 'DRY RUN: stop electron/esbuild processes under this project'
    return
  }

  $processes = Get-CimInstance Win32_Process | Where-Object {
    if (-not $_.CommandLine) {
      return $false
    }

    $isProjectProcess = $_.CommandLine.IndexOf($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    $isDevProcess = $_.Name -in @('electron.exe', 'esbuild.exe', 'node.exe', 'cmd.exe')
    $isCurrentProcess = $_.ProcessId -eq $PID
    return $isProjectProcess -and $isDevProcess -and -not $isCurrentProcess
  }

  if (-not $processes) {
    Write-Host 'No running project dev process found.'
    return
  }

  $processes | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Stopped $($processes.Count) process(es)."
}

function Test-ResearchNotionToolService {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:17777/openapi.json' -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Start-ResearchNotionToolService {
  Write-Host ''
  Write-Host '==> Start ResearchNotion local tool service' -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host 'DRY RUN: start pnpm dev and wait for http://127.0.0.1:17777/openapi.json'
    return
  }

  if (Test-ResearchNotionToolService) {
    Write-Host 'ResearchNotion tool service already responds at http://127.0.0.1:17777.'
    return
  }

  Start-Process `
    -FilePath 'powershell' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "Set-Location '$projectRoot'; $(Get-PnpmCommandText -Arguments @('dev'))") `
    -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds(90)
  do {
    if (Test-ResearchNotionToolService) {
      Write-Host 'ResearchNotion tool service is ready.'
      return
    }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)

  throw 'ResearchNotion local tool service did not become ready within 90 seconds.'
}

function Test-DifyAlive {
  try {
    $response = Invoke-WebRequest -Uri 'http://localhost:8080' -UseBasicParsing -TimeoutSec 5
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

$pnpm = Find-Pnpm

Write-Host ''
Write-Host 'ResearchNotion demo preparation' -ForegroundColor Green
Write-Host "Project: $projectRoot"
Write-Host "pnpm:    $($pnpm.Display)"
Write-Host "Mirror:  $env:ELECTRON_MIRROR"
if ($DryRun) {
  Write-Host 'Mode:    dry run'
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
  Invoke-Step -Label 'Install dependencies' -DisplayCommand 'pnpm install' -FilePath $pnpm.FilePath -Arguments (Join-PnpmArguments -Arguments @('install'))
}

Stop-ProjectDevProcesses

if ($SkipDifyStart) {
  Write-Host ''
  Write-Host '==> Start local Dify' -ForegroundColor Cyan
  Write-Host 'Skipped by -SkipDifyStart.'
} elseif ($DryRun) {
  Write-Host ''
  Write-Host '==> Start local Dify' -ForegroundColor Cyan
  Write-Host 'DRY RUN: scripts\start-dify.ps1 -NoOpen if http://localhost:8080 is not ready'
} elseif (Test-DifyAlive) {
  Write-Host ''
  Write-Host '==> Start local Dify' -ForegroundColor Cyan
  Write-Host 'Dify already responds at http://localhost:8080.'
} else {
  Invoke-Step `
    -Label 'Start local Dify' `
    -DisplayCommand 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-dify.ps1 -NoOpen' `
    -FilePath 'powershell' `
    -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'start-dify.ps1'), '-NoOpen')
}

Invoke-PnpmScript -Label 'Route Dify DeepSeek through local bridge' -ScriptName 'use:deepseek-bridge'
Start-ResearchNotionToolService
Invoke-PnpmScript -Label 'Import ResearchNotion Agent tools' -ScriptName 'import:dify-tools'
Invoke-PnpmScript -Label 'Provision and configure Dify Tool Agent' -ScriptName 'provision:dify-agent'
Stop-ProjectDevProcesses
Invoke-PnpmScript -Label 'Seed real demo papers' -ScriptName 'seed:dify'
Invoke-PnpmScript -Label 'Check Dify agent contract' -ScriptName 'check:dify'
Invoke-PnpmScript -Label 'Verify MVP demo readiness' -ScriptName 'verify:mvp'
Invoke-PnpmScript -Label 'Rebuild native modules for Electron launch' -ScriptName 'rebuild:native'

Write-Host ''
Write-Host 'Demo preparation finished.' -ForegroundColor Green
Write-Host 'Next: run start-research-notion.bat and confirm Settings shows demo-ready status.'

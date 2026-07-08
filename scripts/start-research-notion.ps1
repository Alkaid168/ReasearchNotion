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

if ($pnpmCommand) {
  $pnpm = $pnpmCommand.Source
} elseif (Test-Path $codexPnpm) {
  $pnpm = $codexPnpm
} else {
  Write-Host 'pnpm was not found. Please install pnpm first:' -ForegroundColor Red
  Write-Host '  npm install -g pnpm'
  exit 1
}

Write-Host ''
Write-Host 'ResearchNotion local launcher' -ForegroundColor Cyan
Write-Host "Project: $projectRoot"
Write-Host "pnpm:    $pnpm"
Write-Host "Mirror:  $env:ELECTRON_MIRROR"
Write-Host ''

if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
  Write-Host 'node_modules not found. Installing dependencies...' -ForegroundColor Yellow
  & $pnpm install
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Write-Host 'Rebuilding native modules for Electron...' -ForegroundColor Yellow
& $pnpm exec electron-rebuild -f -w better-sqlite3
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host 'Starting ResearchNotion...' -ForegroundColor Green
Write-Host 'Close the Electron window or press Ctrl+C in this terminal to stop it.'
Write-Host ''

& $pnpm exec electron-vite dev
exit $LASTEXITCODE

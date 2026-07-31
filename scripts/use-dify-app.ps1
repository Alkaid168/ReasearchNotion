param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('workflow', 'agent')]
  [string]$Target
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

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

$pnpm = Find-Pnpm
$scriptName = if ($Target -eq 'agent') { 'use:dify-agent' } else { 'use:dify-workflow' }

Write-Host ''
Write-Host "Switch ResearchNotion Dify app: $Target" -ForegroundColor Cyan
Write-Host "Project: $projectRoot"
Write-Host "pnpm:    $($pnpm.Display)"

$pnpmFile = $pnpm.FilePath
& $pnpmFile @($pnpm.PrefixArgs) $scriptName
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host ''
if ($Target -eq 'agent') {
  Write-Host 'ResearchNotion now uses the tool Agent app.' -ForegroundColor Green
} else {
  Write-Host 'ResearchNotion now uses the stable Workflow app.' -ForegroundColor Green
}

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
  $fallback = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd'
  if (Test-Path -LiteralPath $fallback) {
    $pnpmPath = $fallback
  } else {
    throw 'pnpm was not found. Install pnpm before configuring the Dify Tool Agent.'
  }
} else {
  $pnpmPath = $pnpm.Source
}

& $pnpmPath use:dify-agent
exit $LASTEXITCODE

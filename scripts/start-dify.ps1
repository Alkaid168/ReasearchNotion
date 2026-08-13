param(
  [switch]$NoOpen,
  [string]$DifyRoot = $(if ($env:DIFY_ROOT) { $env:DIFY_ROOT } else { 'D:\Dify\dify-main' })
)

$ErrorActionPreference = 'Stop'

$DifyComposeRoot = Join-Path $DifyRoot 'docker'
$DifyComposeFile = Join-Path $DifyComposeRoot 'docker-compose.yaml'
$DifyEnvFile = Join-Path $DifyComposeRoot '.env'
$DifyUrl = 'http://localhost:8080'
$DifyApiHealthUrl = "$DifyUrl/console/api/system-features"

if (-not (Test-Path -LiteralPath $DifyComposeFile)) {
  Write-Host "Dify compose file was not found: $DifyComposeFile"
  Write-Host 'Set DIFY_ROOT to the directory containing the Dify docker folder.'
  exit 1
}

$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$dockerDesktopCli = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
$dockerDesktopUserCli = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
if ($dockerCommand) {
  $dockerFile = $dockerCommand.Source
} elseif (Test-Path -LiteralPath $dockerDesktopCli) {
  $dockerFile = $dockerDesktopCli
} elseif (Test-Path -LiteralPath $dockerDesktopUserCli) {
  $dockerFile = $dockerDesktopUserCli
} else {
  Write-Host 'Docker was not found. Start Docker Desktop and open a new terminal.'
  exit 1
}

Write-Host 'Starting local Dify...'
$composeArgs = @('compose', '--project-directory', $DifyComposeRoot, '-f', $DifyComposeFile)
if (Test-Path -LiteralPath $DifyEnvFile) {
  $composeArgs += @('--env-file', $DifyEnvFile)
}
& $dockerFile @composeArgs 'up' '-d'
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Waiting for the Dify API at $DifyApiHealthUrl ..."
$deadline = (Get-Date).AddMinutes(3)
$ready = $false

while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -Uri $DifyApiHealthUrl -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 3
  }
}

if (-not $ready) {
  Write-Host "The Dify API did not become ready within 3 minutes. Docker may still be starting."
  Write-Host "You can open it manually later: $DifyUrl"
  exit 1
}

if (-not $NoOpen) {
  Write-Host "Opening $DifyUrl ..."
  Start-Process $DifyUrl
} else {
  Write-Host "Dify is ready at $DifyUrl."
}

param(
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$DifyRoot = 'F:\CODES\dify'
$DifyStartScript = Join-Path $DifyRoot 'start-dify.ps1'
$DifyUrl = 'http://localhost:8080'

if (-not (Test-Path -LiteralPath $DifyStartScript)) {
  Write-Host "Dify startup script was not found: $DifyStartScript"
  Write-Host 'Please check whether local Dify is installed under F:\CODES\dify.'
  exit 1
}

Write-Host 'Starting local Dify...'
& $DifyStartScript

Write-Host "Waiting for Dify at $DifyUrl ..."
$deadline = (Get-Date).AddMinutes(3)
$ready = $false

while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -Uri $DifyUrl -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 3
  }
}

if (-not $ready) {
  Write-Host "Dify did not respond within 3 minutes. Docker may still be starting."
  Write-Host "You can open it manually later: $DifyUrl"
  exit 1
}

if (-not $NoOpen) {
  Write-Host "Opening $DifyUrl ..."
  Start-Process $DifyUrl
} else {
  Write-Host "Dify is ready at $DifyUrl."
}

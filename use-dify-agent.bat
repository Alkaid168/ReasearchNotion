@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\configure-dify-agent.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo ResearchNotion Dify Agent switch exited with code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)

echo.
echo ResearchNotion is now using the Dify tool Agent.
pause
endlocal

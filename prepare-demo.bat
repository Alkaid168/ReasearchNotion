@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\prepare-demo.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo ResearchNotion demo preparation exited with code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)

echo.
echo ResearchNotion demo preparation completed.
pause
endlocal

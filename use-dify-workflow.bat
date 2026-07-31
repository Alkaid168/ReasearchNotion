@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\use-dify-app.ps1" -Target workflow
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo ResearchNotion Dify Workflow switch exited with code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)

echo.
echo ResearchNotion is now using the stable Dify Workflow.
pause
endlocal

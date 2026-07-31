@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

pnpm deepseek:bridge
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo DeepSeek bridge exited with code %EXIT_CODE%.
  pause
  exit /b %EXIT_CODE%
)

endlocal

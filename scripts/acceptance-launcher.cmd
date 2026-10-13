@echo off
setlocal
set "LANCARBON_ROOT=%~dp0installed\LanCarbon"
set "E2E_USER_DATA_DIR="
if not exist "%LANCARBON_ROOT%\Application\LanCarbon.exe" (
  echo The isolated acceptance installation is missing.
  pause
  exit /b 1
)
start "" "%LANCARBON_ROOT%\Application\LanCarbon.exe"
endlocal

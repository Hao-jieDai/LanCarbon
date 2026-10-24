@echo off
setlocal
cd /d "%~dp0"
node scripts/dev-paperqa.cjs --no-build
if errorlevel 1 pause
endlocal

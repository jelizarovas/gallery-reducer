@echo off
rem One-time setup for Gallery Reducer (and re-run it to refresh the lists after Immich has indexed new files).
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
echo.
pause

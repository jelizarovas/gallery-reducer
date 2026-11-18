@echo off
rem Performs the video cuts noted in Gallery Reducer. Originals are moved to the trash folder (video-trims).
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply-trims.ps1" %*
echo.
pause

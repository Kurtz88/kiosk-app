@echo off
chcp 65001 >nul
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\create-kiosk-shortcut.ps1" -ProjectRoot "%CD%"
echo.
pause

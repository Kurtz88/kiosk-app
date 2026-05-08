@echo off
chcp 65001 >nul
title Kiosk - Install Windows autostart

cd /d "%~dp0.."

echo.
echo  This creates a Startup shortcut that runs bat\start_kiosk.bat
echo  every time you sign in to Windows.
echo.
echo  Tip: Kiosk mode usually uses automatic sign-in.
echo  See: Settings ^> Accounts ^> Sign-in options
echo  For advanced setup, check docs\WINDOWS-AUTOSTART.md (Task Scheduler).
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\install-startup-shortcut.ps1" -ProjectRoot "%CD%"
REM Use project-root %CD% so paths work with spaces.

if errorlevel 1 (
  echo.
  echo [ERROR] PowerShell may be blocked by policy.
)

echo.
echo  To remove: Win+R, run shell:startup, delete RestaurantKiosk shortcut.
echo.
pause

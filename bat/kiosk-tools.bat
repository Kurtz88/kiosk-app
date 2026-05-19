@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Kiosk tools
set "ROOT_BAT=%~dp0"
for %%I in ("%ROOT_BAT%..") do set "KIOSK_ROOT=%%~fI"

REM Optional: kiosk-tools.bat [1-9] [extra]   e.g.  kiosk-tools.bat 8 05:30
if "%~1"=="" goto main_menu
if /i "%~1"=="help" goto print_usage
if "%~1"=="0" exit /b 0
if "%~1"=="1" goto cli_run1
if "%~1"=="2" goto cli_run2
if "%~1"=="3" goto cli_run3
if "%~1"=="4" goto cli_run4
if "%~1"=="5" goto cli_run5
if "%~1"=="6" goto cli_run6
if "%~1"=="7" goto cli_run7
if "%~1"=="8" goto cli_run8
if "%~1"=="9" goto cli_run9
echo Unknown option. Run: kiosk-tools.bat help
exit /b 1

:cli_run1
call :op_start
exit /b %ERRORLEVEL%
:cli_run2
call :op_admin
exit /b %ERRORLEVEL%
:cli_run3
call :op_startup_shortcut
exit /b %ERRORLEVEL%
:cli_run4
call :op_task_install
exit /b %ERRORLEVEL%
:cli_run5
call :op_task_remove
exit /b %ERRORLEVEL%
:cli_run6
call :op_desktop
exit /b %ERRORLEVEL%
:cli_run7
call :op_firewall
exit /b %ERRORLEVEL%
:cli_run8
call :op_reboot_install "%~2"
exit /b %ERRORLEVEL%
:cli_run9
call :op_reboot_remove
exit /b %ERRORLEVEL%

:print_usage
echo.
echo  kiosk-tools.bat [number]
echo.
echo   1  Start kiosk launcher (start_kiosk.bat)
echo   2  Open admin page in browser (server must be running)
echo   3  Install Startup folder shortcut (after sign-in)
echo   4  Install Scheduled Task: run at sign-in (~20s delay)
echo   5  Remove Scheduled Task (RestaurantKioskLogon)
echo   6  Create desktop shortcut
echo   7  Allow firewall TCP 3000 (run as Administrator)
echo   8  Install daily PC reboot task (Admin). Optional time: 8 05:30
echo   9  Remove daily reboot task (Admin)
echo   0  Exit (menu only)
echo.
echo  Examples:
echo    kiosk-tools.bat 3
echo    kiosk-tools.bat 8 05:30
echo.
exit /b 0

:main_menu
cls
echo  Kiosk tools   (project: %KIOSK_ROOT%)
echo  ============================================
echo   1  Start kiosk launcher
echo   2  Open admin page (browser)
echo   3  Install Startup shortcut (sign-in)
echo   4  Install sign-in scheduled task
echo   5  Remove sign-in scheduled task
echo   6  Create desktop shortcut
echo   7  Allow firewall port 3000 (Admin)
echo   8  Install daily reboot (Admin)
echo   9  Remove daily reboot (Admin)
echo   0  Exit
echo  ============================================
echo  H  Help (command-line usage^)
echo.
set "CH="
set /p CH=Select option: 
if "%CH%"=="" goto main_menu
if /i "%CH%"=="H" call :print_usage & pause & goto main_menu
if "%CH%"=="0" exit /b 0
if "%CH%"=="1" call :op_start & pause & goto main_menu
if "%CH%"=="2" call :op_admin & pause & goto main_menu
if "%CH%"=="3" call :op_startup_shortcut & pause & goto main_menu
if "%CH%"=="4" call :op_task_install & pause & goto main_menu
if "%CH%"=="5" call :op_task_remove & pause & goto main_menu
if "%CH%"=="6" call :op_desktop & pause & goto main_menu
if "%CH%"=="7" call :op_firewall & pause & goto main_menu
if "%CH%"=="8" (
  set "RT="
  set /p RT=Daily reboot time HH:mm (Enter=04:00): 
  if not defined RT set "RT=04:00"
  call :op_reboot_install "!RT!"
  pause
  goto main_menu
)
if "%CH%"=="9" call :op_reboot_remove & pause & goto main_menu
echo Invalid choice.
pause
goto main_menu

:op_start
call "%ROOT_BAT%start_kiosk.bat"
exit /b 0

:op_admin
echo.
echo Opening http://localhost:3000/admin.html ...
start "" "http://localhost:3000/admin.html"
exit /b 0

:op_startup_shortcut
echo.
echo Install Startup shortcut so start_kiosk.bat runs after sign-in.
echo See docs\WINDOWS-AUTOSTART.md
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%KIOSK_ROOT%\scripts\install-startup-shortcut.ps1" -ProjectRoot "%KIOSK_ROOT%"
if errorlevel 1 echo [ERROR] PowerShell failed.
echo Remove: Win+R, shell:startup, delete RestaurantKiosk shortcut.
exit /b 0

:op_task_install
echo.
echo Register RestaurantKioskLogon task (~20s after sign-in).
echo Remove Startup shortcut if you use both (avoid double launch^).
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%KIOSK_ROOT%\scripts\install-scheduled-task-logon.ps1" -ProjectRoot "%KIOSK_ROOT%"
if errorlevel 1 echo [ERROR] Task registration failed.
exit /b 0

:op_task_remove
echo Removing RestaurantKioskLogon (if present^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%KIOSK_ROOT%\scripts\install-scheduled-task-logon.ps1" -Uninstall
exit /b 0

:op_desktop
powershell -NoProfile -ExecutionPolicy Bypass -File "%KIOSK_ROOT%\scripts\create-kiosk-shortcut.ps1" -ProjectRoot "%KIOSK_ROOT%"
exit /b 0

:op_firewall
echo.
echo Allow inbound TCP 3000 (requires Administrator^).
echo.
net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Run this file as Administrator (right-click).
  exit /b 1
)
netsh advfirewall firewall add rule name="Kiosk Restaurant App (TCP 3000)" dir=in action=allow protocol=TCP localport=3000
if errorlevel 1 (
  echo [ERROR] Rule add failed. A rule with this name may already exist.
  exit /b 1
)
echo [OK] Port 3000 allow rule added.
exit /b 0

:op_reboot_install
set "REBOOT_TIME=%~1"
if "%REBOOT_TIME%"=="" set "REBOOT_TIME=04:00"
set "TASK_NAME=RestaurantKiosk_DailyReboot"
echo.
echo Register daily reboot at %REBOOT_TIME% (task: %TASK_NAME%^).
echo Uses shutdown /r /t 120. Requires Administrator.
echo.
net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Run as Administrator (right-click^).
  exit /b 1
)
schtasks /create /tn "%TASK_NAME%" /tr "shutdown /r /t 120 /c Restaurant kiosk scheduled reboot" /sc daily /st %REBOOT_TIME% /ru SYSTEM /rl HIGHEST /f
if errorlevel 1 (
  echo [ERROR] schtasks failed. Use HH:mm (e.g. 04:00^).
  exit /b 1
)
echo [OK] Registered. Check: taskschd.msc -^> %TASK_NAME%
exit /b 0

:op_reboot_remove
set "TASK_NAME=RestaurantKiosk_DailyReboot"
echo.
echo Remove task %TASK_NAME% (requires Administrator^).
echo.
net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Run as Administrator (right-click^).
  exit /b 1
)
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if errorlevel 1 (
  echo [INFO] Task not found (already removed^).
  exit /b 0
)
schtasks /delete /tn "%TASK_NAME%" /f
if errorlevel 1 (
  echo [ERROR] Delete failed.
  exit /b 1
)
echo [OK] Removed.
exit /b 0

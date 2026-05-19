@echo off
setlocal EnableExtensions
if /i "%~1" neq "__minimized__" (
    start "" /min cmd /c ""%~f0" __minimized__ %*"
    exit /b 0
)
if /i "%~1"=="__minimized__" shift
title Kiosk Server Launcher
color 0B
echo ==========================================================
echo       Offline Restaurant Kiosk App - Launcher
echo ==========================================================
echo.

cd /d "%~dp0.."
set "ROOT=%CD%"

echo Step 1 of 4 - Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
    echo.
    color 0C
    echo ERROR: Node.js is not installed or not in PATH.
    echo Install from https://nodejs.org/ then run this again.
    echo.
    pause
    exit /b 1
)

echo Step 2 of 4 - npm install...
call npm install --silent
if errorlevel 1 (
    echo.
    color 0C
    echo ERROR: npm install failed. Open CMD in this folder and run: npm install
    echo.
    pause
    exit /b 1
)

<<<<<<< HEAD
echo Step 3 of 4 - Starting server in a new window titled Kiosk Server...
REM cd + absolute script path: START /D alone is unreliable with "cmd /k" on some Windows builds.
start "Kiosk Server" /min cmd /k "cd /d ""%ROOT%"" && node ""%ROOT%\backend\server.js"" || pause"
=======
echo Step 3 of 4 - Checking existing server on port 3000...
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo No server detected. Starting a new window titled Kiosk Server...
    REM If Node exits with an error, that window stays open so you can read the message.
    start "Kiosk Server" cmd /k "cd /d ""%ROOT%"" && node backend\server.js || pause"
) else (
    echo Existing server detected on port 3000. Reusing it.
)
>>>>>>> d2ee32d0bcd4d4b7804d1aa88e662fccf37eda6a

echo Step 4 of 4 - Waiting until port 3000 is ready...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\wait-for-port.ps1" -Port 3000 -TimeoutSec 45
if errorlevel 1 (
    echo.
    color 0E
    echo WARNING: Nothing is listening on port 3000 yet.
    echo   - Look at the other window named Kiosk Server for a red error.
    echo   - If it closed: open CMD, then:  cd /d "%ROOT%"
    echo                      then:  node backend\server.js
    echo.
    color 0B
    echo Press any key to open Chrome anyway, or Ctrl+C to exit.
    pause
)

echo.
echo ==========================================================
echo Launching Google Chrome in kiosk mode...
echo Press Alt+F4 to exit kiosk mode.
echo ==========================================================
where chrome.exe >nul 2>nul
if errorlevel 1 (
    echo chrome.exe not in PATH. Trying default Chrome install path...
    if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
        start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --kiosk --user-data-dir="%temp%\kiosk_profile" --no-first-run --disable-infobars http://localhost:3000/index.html
    ) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
        start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --kiosk --user-data-dir="%temp%\kiosk_profile" --no-first-run --disable-infobars http://localhost:3000/index.html
    ) else (
        color 0E
        echo Chrome not found. Open this address in Edge or another browser:
        echo   http://localhost:3000/index.html
        color 0B
        start "" http://localhost:3000/index.html
    )
) else (
    start chrome.exe --kiosk --user-data-dir="%temp%\kiosk_profile" --no-first-run --disable-infobars http://localhost:3000/index.html
)

if /i "%~1"=="nopause" exit /b 0

echo.
echo NOTE: Keep the Kiosk Server window open. Closing it stops the web server.
pause
endlocal

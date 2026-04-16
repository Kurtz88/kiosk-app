@echo off
title Kiosk Admin Dashboard Launcher
color 0A
echo ==========================================================
echo         Opening Restaurant Kiosk Admin Panel
echo ==========================================================
echo.
echo NOTE: Make sure your Main Kiosk Server (bat\start_kiosk.bat) 
echo is currently running in the background!
echo.
echo Launching the administrator page on your normal browser...
timeout /t 2 /nobreak >nul
start http://localhost:3000/admin.html

@echo off
chcp 65001 >nul
title 키오스크 USB 업데이트

REM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REM  아래 KIOSK_APP 를 이 PC에서 키오스크 앱이 있는 폴더로 수정하세요. (최초 1회)
REM  예: set "KIOSK_APP=D:\kiosk-restaurant-app"
REM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set "KIOSK_APP=C:\Users\Home\Downloads\kiosk-restaurant-app"

set "USBROOT=%~dp0"
set "EXCEL=%USBROOT%맛집목록.xlsx"
set "IMGDIR=%USBROOT%uploads"

if not exist "%KIOSK_APP%\backend\server.js" (
  echo [오류] KIOSK_APP 경로가 잘못되었습니다. UPDATE.bat 을 메모장으로 열어 KIOSK_APP 를 수정하세요.
  pause
  exit /b 1
)

if not exist "%EXCEL%" (
  echo [오류] 이 USB 안에 "맛집목록.xlsx" 파일이 있어야 합니다.
  echo        현재 위치: %USBROOT%
  pause
  exit /b 1
)

echo 엑셀 반영 중... (서버가 켜져 있으면 잠깐 멈출 수 있습니다)
pushd "%KIOSK_APP%"
call node scripts\usb-update.js "%EXCEL%" "%IMGDIR%"
set "ERR=%ERRORLEVEL%"
popd

echo.
if "%ERR%"=="0" (
  echo [완료] 반영이 끝났습니다. 키오스크 새로고침 후 확인하세요.
) else (
  echo [주의] 일부 행에서 오류가 있었을 수 있습니다. 위 로그를 확인하세요.
)
pause

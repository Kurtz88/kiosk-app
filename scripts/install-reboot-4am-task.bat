@echo off
chcp 65001 >nul
setlocal

REM 관리자 권한 확인
net session >nul 2>&1
if errorlevel 1 (
    echo [오류] 관리자 권한으로 실행하세요. BAT 파일 우클릭 → "관리자 권한으로 실행"
    pause
    exit /b 1
)

set "TASK_NAME=KioskReboot4AM"

if not exist "%~dp0reboot-4am.bat" (
    echo [오류] reboot-4am.bat 을 찾을 수 없습니다: %~dp0
    pause
    exit /b 1
)

echo 매일 새벽 4:00 에 재부팅 작업 등록 중...
echo 실행 파일: %~dp0reboot-4am.bat
echo.

schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "\"%~dp0reboot-4am.bat\"" ^
  /sc daily ^
  /st 04:00 ^
  /ru SYSTEM ^
  /rl HIGHEST ^
  /f

if errorlevel 1 (
    echo [오류] 작업 등록 실패
    pause
    exit /b 1
)

echo.
echo [완료] "%TASK_NAME%" 등록됨 — 매일 04:00 재부팅
echo 확인: 작업 스케줄러 → 작업 스케줄러 라이브러리 → %TASK_NAME%
echo 삭제: schtasks /delete /tn "%TASK_NAME%" /f
echo.
pause

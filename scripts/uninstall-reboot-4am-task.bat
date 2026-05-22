@echo off
chcp 65001 >nul
set "TASK_NAME=KioskReboot4AM"

net session >nul 2>&1
if errorlevel 1 (
    echo [오류] 관리자 권한으로 실행하세요.
    pause
    exit /b 1
)

schtasks /delete /tn "%TASK_NAME%" /f
if errorlevel 1 (
    echo 작업이 없거나 삭제 실패: %TASK_NAME%
) else (
    echo [완료] %TASK_NAME% 삭제됨
)
pause

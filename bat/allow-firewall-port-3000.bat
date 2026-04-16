@echo off
chcp 65001 >nul
title 방화벽: 키오스크 포트 3000 허용

echo.
echo  Wi-Fi에서 다른 기기가 이 PC의 3000 포트로 접속하려면
echo  Windows 방화벽에서 들어오는 연결을 허용해야 합니다.
echo.
echo  이 창을 **관리자 권한으로 실행**해야 합니다.
echo  (스크립트 우클릭 → 관리자 권한으로 실행)
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [오류] 관리자 권한이 아닙니다. 이 파일을 우클릭해서 "관리자 권한으로 실행" 하세요.
    pause
    exit /b 1
)

netsh advfirewall firewall add rule name="Kiosk Restaurant App (TCP 3000)" dir=in action=allow protocol=TCP localport=3000
if %errorlevel% equ 0 (
    echo.
    echo [완료] 포트 3000 허용 규칙을 추가했습니다.
    echo        서버를 다시 실행한 뒤 폰에서 http://이PC의IP:3000 을 열어보세요.
) else (
    echo.
    echo [오류] 규칙 추가 실패. 이미 같은 이름의 규칙이 있을 수 있습니다.
)

echo.
pause

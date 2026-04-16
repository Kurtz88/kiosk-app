@echo off
chcp 65001 >nul
title 키오스크 - Windows 시작 시 자동 실행 등록

cd /d "%~dp0.."

echo.
echo  이 PC에 로그인할 때마다 bat\start_kiosk.bat 이 자동으로 실행되도록
echo  [시작 프로그램] 폴더에 바로가기를 만듭니다.
echo.
echo  ※ 키오스크는 보통 [자동 로그인]과 함께 씁니다.
echo     설정 ^> 계정 ^> 로그인 옵션
echo  ※ 더 세밀한 제어는 docs\WINDOWS-AUTOSTART.md 의 작업 스케줄러 방법을 보세요.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\install-startup-shortcut.ps1" -ProjectRoot "%CD%"
REM 경로에 공백이 있어도 동작하도록 위에서 cd 로 루트를 맞춘 뒤 %CD% 사용

if errorlevel 1 (
  echo.
  echo [오류] PowerShell 실행이 막혀 있을 수 있습니다.
)

echo.
echo  해제: Win+R → shell:startup 입력 → RestaurantKiosk 바로가기 삭제
echo.
pause

@echo off
chcp 65001 >nul
title Gimkit Web 게임 서버 (호스트용)
cd /d "%~dp0"

echo ========================================================
echo   🎮 Gimkit Web 게임 서버를 시작합니다! (Windows 호스트용)
echo ========================================================
echo.

set "NODE_CMD=node"

:: 1. 시스템에 node가 설치되어 있는지 확인
where node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    goto :START_SERVER
)

:: 2. 로컬 bin 폴더에 node.exe가 있는지 확인
if exist "%~dp0bin\node.exe" (
    set "NODE_CMD=%~dp0bin\node.exe"
    goto :START_SERVER
)

:: 3. node가 없으면 안내 및 포터블 Node 다운로드 시도
echo [안내] 이 컴퓨터에 Node.js가 설치되어 있지 않습니다.
echo 선생님 PC에서 바로 실행할 수 있도록 경량 Node.js 엔진을 자동 준비합니다...
echo 잠시만 기다려 주세요 (최초 1회만 약 10~20초 소요)...
echo.

if not exist "%~dp0bin" mkdir "%~dp0bin"

powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Write-Host 'Node.js 다운로드 중...'; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/win-x64/node.exe' -OutFile '%~dp0bin\node.exe' }"

if exist "%~dp0bin\node.exe" (
    echo [성공] 실행 엔진 준비가 완료되었습니다!
    set "NODE_CMD=%~dp0bin\node.exe"
    goto :START_SERVER
) else (
    echo.
    echo [알림] 자동 다운로드에 실패했습니다. (인터넷 보안 설정 등)
    echo 브라우저에서 공식 사이트를 열어 드립니다. 설치 후 다시 실행해 주세요:
    echo https://nodejs.org/ (LTS 버전 다운로드)
    start https://nodejs.org/
    pause
    exit /b 1
)

:START_SERVER
echo.
echo ========================================================
echo 🔗 호스트 대시보드 : http://localhost:3000/host.html
echo 🔗 플레이어 메인   : http://localhost:3000
echo ========================================================
echo 💡 잠시 후 호스트 관리자 화면이 브라우저에서 자동으로 열립니다.
echo 💡 서버를 종료하려면 이 창을 닫거나 Ctrl + C 를 누르세요.
echo ========================================================
echo.

:: 2초 후 기본 브라우저로 호스트 대시보드 자동 열기
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000/host.html"

:: 서버 실행
"%NODE_CMD%" server.js

pause

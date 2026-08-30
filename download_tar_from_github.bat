@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

title checkOn - Download & Export Source .tar from GitHub

echo ========================================================
echo   checkOn GitHub Repository Archive Exporter (.tar)
echo ========================================================
echo.

set REPO_URL=https://github.com/glory7138-lab/checkOn.git
set BRANCH=main
set TAR_NAME=checkon_latest.tar

echo [1/3] Fetching latest source from origin/%BRANCH%...
git fetch origin %BRANCH%

echo [2/3] Creating clean .tar archive from git...
git archive --format=tar --output=%TAR_NAME% origin/%BRANCH%

if exist "%TAR_NAME%" (
    echo.
    echo ========================================================
    echo   [SUCCESS] Created %TAR_NAME% successfully!
    echo ========================================================
    echo.
    echo File Path: %CD%\%TAR_NAME%
    echo.
    echo 1. Synology NAS File Station 에 '%TAR_NAME%' 파일을 업로드하세요.
    echo 2. 압축을 해제한 후 Container Manager 에서 docker-compose.yml 로 빌드/실행하시면 됩니다.
    echo.
) else (
    echo.
    echo [ERROR] Failed to create %TAR_NAME%. Please check Git status.
    echo.
)

pause

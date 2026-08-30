@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo   checkOn GitHub Repository Archive Exporter (.tar)
echo ========================================================
echo.

set TAR_NAME=gospel_app.tar

echo [1/2] Fetching latest source from origin/main...
git fetch origin main

echo [2/2] Creating clean gospel_app.tar archive...
git archive --format=tar --output=%TAR_NAME% origin/main

if exist "%TAR_NAME%" (
    echo.
    echo ========================================================
    echo   [SUCCESS] Created %TAR_NAME% successfully!
    echo ========================================================
    echo.
    echo File: %~dp0%TAR_NAME%
    echo.
) else (
    echo.
    echo [ERROR] Failed to create %TAR_NAME%.
    echo.
)

pause

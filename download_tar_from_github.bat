@echo off
setlocal
set "GIT_DIR="

cd /d "%~dp0"

echo ==================================================
echo [0/4] Setting up Git and GitHub CLI environments...
echo ==================================================

where git >nul 2>nul
if %errorlevel% neq 0 call :setup_git

where gh >nul 2>nul
if %errorlevel% neq 0 call :setup_gh

goto :start_main

:setup_git
echo Git not found in PATH, searching in common locations...
if not exist "C:\Program Files\Git\cmd\git.exe" goto :no_git_1
set "PATH=C:\Program Files\Git\cmd;%PATH%"
echo Found Git in Program Files.
goto :eof
:no_git_1

if not exist "C:\Program Files (x86)\Git\cmd\git.exe" goto :no_git_2
set "PATH=C:\Program Files (x86)\Git\cmd;%PATH%"
echo Found Git in Program Files (x86).
goto :eof
:no_git_2

if not exist "%USERPROFILE%\AppData\Local\Programs\Git\cmd\git.exe" goto :no_git_3
set "PATH=%USERPROFILE%\AppData\Local\Programs\Git\cmd;%PATH%"
echo Found Git in AppData.
goto :eof
:no_git_3

echo Searching for MinGit in Gemini cache...
set "FOUND_GIT="
for /f "delims=" %%a in ('dir /s /b "%USERPROFILE%\.gemini\antigravity\brain\git.exe" 2^>nul') do (
    call :check_git_path "%%a"
)

if not defined FOUND_GIT (
    echo [WARNING] Git not found. Git commands might fail.
    goto :eof
)

for %%i in ("%FOUND_GIT%") do set "TMP_GIT_DIR=%%~dpi"
set "PATH=%TMP_GIT_DIR%;%PATH%"
echo Found MinGit at %TMP_GIT_DIR%
goto :eof

:check_git_path
set "FILEPATH=%~1"
set "TEMP_PATH=%FILEPATH:\cmd\git.exe=%"
if not "%TEMP_PATH%" == "%FILEPATH%" (
    set "FOUND_GIT=%FILEPATH%"
)
goto :eof

:setup_gh
echo GitHub CLI (gh) not found in PATH, searching...
if not exist "C:\Program Files\GitHub CLI\gh.exe" goto :no_gh_1
set "PATH=C:\Program Files\GitHub CLI;%PATH%"
echo Found gh in Program Files.
goto :eof
:no_gh_1

if not exist "%USERPROFILE%\AppData\Local\Programs\GitHub CLI\gh.exe" goto :no_gh_2
set "PATH=%USERPROFILE%\AppData\Local\Programs\GitHub CLI;%PATH%"
echo Found gh in AppData.
goto :eof
:no_gh_2

echo [WARNING] GitHub CLI (gh) not found. gh commands might fail.
goto :eof

:start_main
echo.
echo ==================================================
echo [1/4] Pushing latest code to GitHub...
echo ==================================================
git add .
git commit -m "Auto deploy build for NAS Container Manager"
git push origin main
if %errorlevel% neq 0 (
    echo [ERROR] GitHub push failed.
    pause
    exit /b
)

echo.
echo ==================================================
echo [2/4] GitHub Actions is building the Docker image...
echo ==================================================
echo Please wait about 1-2 minutes until the build is complete.
echo (Press any key after checking GitHub Actions tab...)
pause

echo.
echo ==================================================
echo [3/4] Downloading gospel_app.tar ...
echo ==================================================
if not exist "nas_deploy" mkdir "nas_deploy"
if exist "nas_deploy\gospel_app.tar" del "nas_deploy\gospel_app.tar"

echo Downloading from GitHub Releases (latest)...
python get_token_and_download.py

if exist "nas_deploy\gospel_app.tar\gospel_app.tar" (
    move /y "nas_deploy\gospel_app.tar\gospel_app.tar" nas_deploy\ >nul
    rmdir /q "nas_deploy\gospel_app.tar"
)

if not exist "nas_deploy\gospel_app.tar" (
    echo [ERROR] tar file not found. Wait a bit more and try again.
    pause
    exit /b
)

echo.
echo ==================================================
echo [4/4] Copying config files...
echo ==================================================
copy /y "docker-compose.yml" "nas_deploy\docker-compose.yml"
echo Config files copied.

echo.
echo ==================================================
echo [SUCCESS] Docker Image package downloaded!
echo.
echo Location: nas_deploy\ folder
echo Now upload all files in nas_deploy\ to your NAS manually:
echo   - gospel_app.tar (Import via Container Manager)
echo   - docker-compose.yml
echo ==================================================
pause

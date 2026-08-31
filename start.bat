@echo off
title checkOn Server

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
)

set PORT=4000

echo Opening browser... http://localhost:%PORT%
start http://localhost:%PORT%

echo Starting server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%PORT% ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
node server/server.js

pause

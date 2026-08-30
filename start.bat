@echo off
title checkOn Server

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
)

set PORT=3033

echo Opening browser... http://localhost:%PORT%
start http://localhost:%PORT%

echo Starting server...
node server/server.js

pause

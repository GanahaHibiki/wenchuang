@echo off
cd /d "%~dp0"
echo Starting WenChuang Order Management System...
echo.

REM Check if node_modules exists
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Frontend: http://localhost:5173
echo Backend: http://localhost:3001
echo.
echo Please wait for the server to start...
echo Press Ctrl+C to stop the server.
echo.

REM Start the server, wait 5 seconds, then open browser
start /b cmd /c "npm run dev"
timeout /t 5 /nobreak >nul
start "" http://localhost:5173

REM Keep window open
cmd /k

@echo off
cd /d "%~dp0"
echo Starting WenChuang Order Management System...
echo.
echo Frontend: http://localhost:5173
echo Backend: http://localhost:3001
echo.
echo Press Ctrl+C to stop the server.
echo.
start "" http://localhost:5173
npm run dev

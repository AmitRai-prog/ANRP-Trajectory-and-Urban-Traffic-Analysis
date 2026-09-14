@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%frontend"
echo Starting Vite Frontend at http://localhost:5173...
call npm run dev
pause

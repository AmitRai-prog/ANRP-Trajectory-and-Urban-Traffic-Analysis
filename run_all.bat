@echo off
setlocal
set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo ========================================================
echo Starting FlytBase Drone Traffic Analytics Project
echo ========================================================

if exist "%ROOT_DIR%SIH-26-main\run_backend.bat" (
    start "FlytBase Backend" cmd /c "%ROOT_DIR%SIH-26-main\run_backend.bat"
    start "FlytBase Frontend" cmd /c "%ROOT_DIR%SIH-26-main\run_frontend.bat"
) else (
    start "FlytBase Backend" cmd /c "%ROOT_DIR%run_backend.bat"
    start "FlytBase Frontend" cmd /c "%ROOT_DIR%run_frontend.bat"
)

echo Waiting for servers to initialize...
timeout /t 3 /nobreak >nul
start http://localhost:5173
echo.
echo Application running at: http://localhost:5173
echo Backend API running at: http://localhost:8000
echo.
pause

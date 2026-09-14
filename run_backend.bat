@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if exist "%SCRIPT_DIR%..\.venv\Scripts\python.exe" (
    set "PY_EXE=%SCRIPT_DIR%..\.venv\Scripts\python.exe"
) else if exist "%SCRIPT_DIR%.venv\Scripts\python.exe" (
    set "PY_EXE=%SCRIPT_DIR%.venv\Scripts\python.exe"
) else (
    set "PY_EXE=python"
)

echo Starting FastAPI Backend with: %PY_EXE%
cd /d "%SCRIPT_DIR%backend"
"%PY_EXE%" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause

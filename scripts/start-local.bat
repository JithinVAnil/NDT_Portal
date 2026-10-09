@echo off
REM Starts backend (port 8000) and frontend (port 3000) in two windows.
cd /d "%~dp0\.."
start "NIELIT API :8000" cmd /k "cd backend && call .venv\Scripts\activate.bat && uvicorn app.main:app --host 127.0.0.1 --port 8000"
timeout /t 5 /nobreak >nul
start "NIELIT Portal :3000" cmd /k "cd frontend && npm run dev"
timeout /t 10 /nobreak >nul
start http://localhost:3000

@echo off
REM NIELIT Prototype - one-click start with Docker Desktop (free for personal/education/small business use)
cd /d "%~dp0\.."
if not exist .env copy .env.example .env >nul
echo Starting PostgreSQL, backend and frontend... first run downloads images and may take several minutes.
docker compose up --build -d
if errorlevel 1 (
  echo.
  echo Docker failed to start. Is Docker Desktop running?  Alternatively use scripts\setup-local.bat
  pause
  exit /b 1
)
echo.
echo Waiting for the portal to come up...
timeout /t 15 /nobreak >nul
echo   Frontend : http://localhost:3000
echo   API      : http://localhost:8000
echo   Swagger  : http://localhost:8000/docs
start http://localhost:3000
pause

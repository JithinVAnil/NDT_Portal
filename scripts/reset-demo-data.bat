@echo off
REM Restores the initial demo dataset (same as Settings > Reset Demo Data in the portal).
cd /d "%~dp0\..\backend"
if exist .venv\Scripts\activate.bat (
  call .venv\Scripts\activate.bat
  python -m app.seed.seed
) else (
  cd ..
  docker compose exec backend python -m app.seed.seed
)
pause

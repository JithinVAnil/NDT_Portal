@echo off
REM NIELIT Prototype - local setup WITHOUT Docker (Windows)
REM Requires: Python 3.11+ and Node.js 20+ (both free). PostgreSQL 16 recommended (free installer).
cd /d "%~dp0\.."

echo === Backend: creating virtual environment and installing packages ===
cd backend
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt || goto :error
if not exist .env copy .env.example .env >nul
cd ..

echo === Frontend: installing packages ===
cd frontend
call npm install || goto :error
cd ..

echo.
echo Setup complete.
echo  - Using PostgreSQL? Create the database first (see README "Local PostgreSQL").
echo  - No PostgreSQL? Edit backend\.env and set:  DATABASE_URL=sqlite:///./nielit_demo.db
echo Then run scripts\start-local.bat
pause
exit /b 0

:error
echo Setup failed. See the messages above.
pause
exit /b 1

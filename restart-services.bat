@echo off
cd /d "%~dp0"

echo Stopping services...
:kill8000
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000.*LISTENING"') do (
  taskkill /F /PID %%a 2>nul
  taskkill /F /T /PID %%a 2>nul
  goto kill8000
)
:kill3000
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000.*LISTENING"') do (
  taskkill /F /PID %%a 2>nul
  taskkill /F /T /PID %%a 2>nul
  goto kill3000
)

echo Waiting for ports to be released...
timeout /t 3 /nobreak >nul

echo Starting API (port 8000)...
start "Amplify API" cmd /k "cd services\api && python -m uvicorn app.main:app"

timeout /t 2 /nobreak >nul

echo Starting Web (port 3000)...
start "Amplify Web" cmd /k "cd apps\web && npm run dev"

echo Done. API and Web are starting in separate windows.
pause

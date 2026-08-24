@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is required.
  pause
  exit /b 1
)
start "" /b node server.js
timeout /t 2 /nobreak >nul
start "" http://localhost:3000
echo.
echo EVENTCLOCK запущен: http://localhost:3000
echo Не закрывай это окно, пока пользуешься сайтом.
pause

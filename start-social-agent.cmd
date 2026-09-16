@echo off
setlocal EnableExtensions
title Social Agent - Autonomous Social Media Manager
cd /d "%~dp0"

echo.
echo  ============================================================
echo    SOCIAL AGENT - Autonomous AI Social Media Manager
echo    URL:  http://localhost:3000
echo    Close this window to stop the agent.
echo  ============================================================
echo.

rem ---- First run: install dependencies ----
if not exist node_modules (
  echo  [setup] Installing dependencies, one moment...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  [ERROR] npm install failed. Run "npm install" manually in:
    echo          %~dp0
    pause
    exit /b 1
  )
)

rem ---- Node present? ----
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERROR] Node.js was not found on PATH.
  echo          Install it from https://nodejs.org then restart.
  pause
  exit /b 1
)

rem ---- Already running? (port 3000) ----
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 3000); $c.Close(); exit 1 } catch { exit 0 }"
if %errorlevel% EQU 1 (
  echo  The agent is ALREADY running.
  start "" "http://localhost:3000"
  echo  Opened the dashboard in your browser. You can close this window.
  timeout /t 2 /nobreak >nul
  exit /b 0
)

echo  [start] Launching the agent...
node src/index.js

echo.
echo  Social Agent stopped. Press any key to close.
pause
exit /b 0
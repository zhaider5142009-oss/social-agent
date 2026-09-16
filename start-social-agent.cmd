@echo off
title Social Agent - Autonomous Social Media Manager
cd /d "%~dp0"

echo.
echo  ============================================
echo   Social Agent  -  Autonomous AI Social Media
echo   UI: http://localhost:3000
echo   Close this window to stop the agent.
echo  ============================================
echo.
if not exist node_modules (
  echo  First run: installing dependencies...
  call npm install --no-audit --no-fund
)
where node >nul 2>nul || (echo [ERROR] Node.js not found & pause & exit /b 1)

node src/index.js
echo.
echo  Social Agent stopped.
pause
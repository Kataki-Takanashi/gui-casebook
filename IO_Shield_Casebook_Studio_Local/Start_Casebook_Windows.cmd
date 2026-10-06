@echo off
setlocal
cd /d "%~dp0"
if exist "runtime\node.exe" (
  set "CASEBOOK_NODE=%~dp0runtime\node.exe"
) else (
  set "CASEBOOK_NODE=node"
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js is required. Install Node.js 24 from https://nodejs.org/en/download
    echo Or put a portable Node.js 24 node.exe in the runtime folder.
    pause
    exit /b 1
  )
)
"%CASEBOOK_NODE%" -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 (
  echo Please install Node.js 24 or newer, then run this launcher again.
  pause
  exit /b 1
)
"%CASEBOOK_NODE%" server.mjs --open
pause

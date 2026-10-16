@echo off
setlocal
cd /d "%~dp0"
set "FINAGENT_FORCE_PROD_LOAD=1"
set "ELECTRON_RUN_AS_NODE="
rem This launcher is for interactive use, even from a test-oriented shell.
set "FINAGENT_E2E_HIDDEN="
set "FINAGENT_E2E_VISIBLE=1"
rem Node spawn(shell:false) needs a native executable on Windows, not bunx.cmd.
if not defined FINAGENT_PI_COMMAND (
  if exist "%APPDATA%\npm\node_modules\bun\bin\bunx.exe" set "FINAGENT_PI_COMMAND=%APPDATA%\npm\node_modules\bun\bin\bunx.exe"
)
if exist "%LOCALAPPDATA%\Programs\longbridge\longbridge.exe" set "PATH=%LOCALAPPDATA%\Programs\longbridge;%PATH%"
if not exist "apps\electron\dist\renderer\index.html" (
  echo Run bun.cmd run build:electron first.
  exit /b 1
)
"node_modules\electron\dist\electron.exe" "apps\electron\src\main\index.js"
endlocal

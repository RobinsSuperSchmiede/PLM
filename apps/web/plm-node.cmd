@echo off
rem Node.js for the desktop app (openshell.json runs "plm-node ..."), also when Node.js is not on the
rem PATH. Order: PLM_NODE, node on the PATH, the usual install folder, and else a portable Node.js that
rem scripts\runtimes\ensure.ps1 downloads once into the app's data folder. Only Node.js 20 or newer
rem counts. Its folder goes first on the PATH, so npm and the scripts it runs find the same node.
rem PLM_DOWNLOAD_RUNTIMES=1 skips the search (to try the download on a machine that has Node.js).
setlocal
set "NODE="
if defined PLM_DOWNLOAD_RUNTIMES goto download
if defined PLM_NODE call :check "%PLM_NODE%"
if not defined NODE for /f "delims=" %%p in ('where node 2^>nul') do if not defined NODE call :check "%%p"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" call :check "%ProgramFiles%\nodejs\node.exe"
:download
if not defined NODE for /f "usebackq delims=" %%p in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\..\scripts\runtimes\ensure.ps1" node`) do set "NODE=%%p"
if not defined NODE (
  echo Node.js 20 or newer was not found and could not be downloaded. Install it from nodejs.org, or set PLM_NODE to node.exe. 1>&2
  exit /b 9009
)
for %%d in ("%NODE%") do set "PATH=%%~dpd;%PATH%"
"%NODE%" %*
exit /b %errorlevel%

:check
"%~1" -e "process.exit(parseInt(process.versions.node) < 20 ? 1 : 0)" >nul 2>&1 && set "NODE=%~1"
exit /b 0

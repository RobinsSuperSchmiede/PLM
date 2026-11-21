@echo off
rem Python for the desktop app (openshell.json runs "plm-python ..."), also when Python is not on the
rem PATH, e.g. a python.org install without "Add to PATH" started from the Start menu. Order:
rem PLM_PYTHON, python on the PATH, the py launcher, the usual python.org install folders, and else a
rem portable Python that scripts\runtimes\ensure.ps1 downloads once into the app's data folder.
rem Only Python 3.11 or newer counts; the Microsoft Store placeholder fails the check.
rem PLM_DOWNLOAD_RUNTIMES=1 skips the search (to try the download on a machine that has Python).
setlocal
set "PY="
if defined PLM_DOWNLOAD_RUNTIMES goto download
if defined PLM_PYTHON call :check "%PLM_PYTHON%"
if not defined PY for /f "delims=" %%p in ('where python 2^>nul') do if not defined PY call :check "%%p"
if not defined PY for /f "delims=" %%l in ('where py 2^>nul') do if not defined PY call :launcher "%%l"
if not defined PY for %%l in ("%LOCALAPPDATA%\Programs\Python\Launcher\py.exe" "%WINDIR%\py.exe") do if not defined PY if exist %%l call :launcher %%l
if not defined PY for /d %%d in ("%LOCALAPPDATA%\Programs\Python\Python3*" "%ProgramFiles%\Python3*") do if not defined PY if exist "%%d\python.exe" call :check "%%d\python.exe"
:download
if not defined PY for /f "usebackq delims=" %%p in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\..\scripts\runtimes\ensure.ps1" python`) do set "PY=%%p"
if not defined PY (
  echo Python 3.11 or newer was not found and could not be downloaded. Install it from python.org, or set PLM_PYTHON to python.exe. 1>&2
  exit /b 9009
)
"%PY%" %*
exit /b %errorlevel%

:check
"%~1" -c "import sys; sys.exit(sys.version_info < (3, 11))" >nul 2>&1 && set "PY=%~1"
exit /b 0

:launcher
for /f "delims=" %%e in ('"%~1" -3 -c "import sys; print(sys.executable if sys.version_info >= (3, 11) else '')" 2^>nul') do if not "%%e"=="" set "PY=%%e"
exit /b 0

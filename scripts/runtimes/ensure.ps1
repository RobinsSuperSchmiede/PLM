<#
.SYNOPSIS
  Prints the path of a portable Python or Node.js for the desktop app, downloading it on first use.

.DESCRIPTION
  apps/api/plm-python.cmd and apps/web/plm-node.cmd call this when the machine has no suitable Python
  (3.11+) or Node.js (20+). The pinned builds below are downloaded once into
  OPENSHELL_DATA_DIR\runtimes (the app's data folder; without it %LOCALAPPDATA%\Anamnesies\runtimes),
  checked against their SHA-256 and unpacked. Progress goes to stderr; stdout is only the path.

    powershell -NoProfile -ExecutionPolicy Bypass -File ensure.ps1 python|node

  Keep the versions in sync with ensure.sh (macOS, Linux).
#>
param([Parameter(Mandatory)][ValidateSet("python", "node")][string]$Tool)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest is very slow with its progress bar
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.ServicePointManager]::SecurityProtocol

# Python: the official python.org build from NuGet (signed by the Python Software Foundation, so Smart
# App Control lets it run; it includes venv and ensurepip). Node.js: the official, signed build.
$pins = @{
    python = @{
        name   = "python-3.13.17"
        url    = "https://api.nuget.org/v3-flatcontainer/python/3.13.17/python.3.13.17.nupkg"
        sha256 = "dce409744b088f94c6e37ba41f8100c384c27e029e843237364c602d30d475e5"
        exe    = "tools\python.exe"
    }
    node   = @{
        name   = "node-v24.22.3"
        url    = "https://nodejs.org/dist/v24.22.3/node-v24.22.3-win-x64.zip"
        sha256 = "e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f"
        exe    = "node-v24.22.3-win-x64\node.exe"
    }
}

function Say([string]$text) { [Console]::Error.WriteLine("[runtimes] $text") }

if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64" -and $env:PROCESSOR_ARCHITEW6432 -ne "AMD64") {
    # Windows on ARM runs x64 programs through emulation, which is what these builds rely on.
    Say "note: using the x64 build of $Tool on $env:PROCESSOR_ARCHITECTURE"
}

$pin = $pins[$Tool]
$base = if ($env:OPENSHELL_DATA_DIR) { $env:OPENSHELL_DATA_DIR } else { Join-Path $env:LOCALAPPDATA "Anamnesies" }
$runtimes = Join-Path $base "runtimes"
$target = Join-Path $runtimes $pin.name
$exe = Join-Path $target $pin.exe

if (-not (Test-Path $exe)) {
    New-Item -ItemType Directory -Force $runtimes | Out-Null
    # A folder of its own per attempt: the services may start at the same time and both download.
    $work = Join-Path $runtimes ".download-$Tool-$PID"
    if (Test-Path $work) { Remove-Item -Recurse -Force $work }
    New-Item -ItemType Directory $work | Out-Null
    try {
        $archive = Join-Path $work ([IO.Path]::GetFileName(([Uri]$pin.url).LocalPath))
        Say "$Tool was not found on this computer; downloading $($pin.name) (once, into $runtimes)"
        Invoke-WebRequest -UseBasicParsing -Uri $pin.url -OutFile $archive
        $actual = (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLowerInvariant()
        if ($actual -ne $pin.sha256) { throw "checksum mismatch for $($pin.url): $actual" }
        $unpacked = Join-Path $work "unpacked"
        New-Item -ItemType Directory $unpacked | Out-Null
        # tar.exe ships with Windows 10 1803 and newer and reads .tar.gz as well as .zip (and .nupkg, a zip).
        & "$env:SystemRoot\System32\tar.exe" -xf $archive -C $unpacked
        if ($LASTEXITCODE -ne 0) { throw "could not unpack $archive" }
        if (-not (Test-Path $exe)) {
            try { Move-Item $unpacked $target } catch { if (-not (Test-Path $exe)) { throw } }
        }
        Say "$Tool is ready: $exe"
    } finally {
        Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
    }
}

Write-Output $exe

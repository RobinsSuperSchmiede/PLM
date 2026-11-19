<#
.SYNOPSIS
  Sets Anamnesies up as a Windows desktop app (Start menu, Windows search), run by OpenShell.

.DESCRIPTION
  - OpenShell: copied from -OpenShellDir (a folder with openshell.exe and openshell-desktop.exe, e.g.
    target\release of a cargo build) into %LOCALAPPDATA%\OpenShell\bin, where OpenShell's own install
    script puts it. Without -OpenShellDir an OpenShell already there is used; if there is none, the
    release -OpenShellVersion is downloaded with the GitHub CLI (gh, signed in: the repository is
    private) and checked against the release's SHA256SUMS.txt. The PATH is not changed.
  - -ProgramDir (default %LOCALAPPDATA%\Programs\Anamnesies): Anamnesies.exe (OpenShell's desktop shell) and "app", a
    junction to this repository. OpenShell runs it like an installed app: production mode, one
    instance, tray, data per user in %LOCALAPPDATA%\com.anamnesies.app. The code keeps running from
    this repository, so changes here (by hand or by a coding agent) apply after a restart of the
    service or the app.
  - A Start menu entry "Anamnesies", which Windows search finds.

  Run it again after updating OpenShell. -Uninstall removes the Start menu entry and the program
  folder; data and this repository are never touched.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-desktop.ps1 -Start
#>
param(
    [switch]$Uninstall,
    [switch]$Start,
    [string]$OpenShellVersion = "v0.2.0",
    [string]$OpenShellDir,
    [string]$ProgramDir = (Join-Path $env:LOCALAPPDATA "Programs\Anamnesies")
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$openShellBin = Join-Path $env:LOCALAPPDATA "OpenShell\bin"
$program = $ProgramDir
$exe = Join-Path $program "Anamnesies.exe"
$app = Join-Path $program "app"
$shortcut = Join-Path ([Environment]::GetFolderPath("Programs")) "Anamnesies.lnk"
$data = Join-Path $env:LOCALAPPDATA "com.anamnesies.app"

function Assert-NotRunning {
    $running = Get-Process -Name "Anamnesies" -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and ($_.Path -ieq $exe) }
    if ($running) {
        throw "Anamnesies is running. Quit it first (tray icon > Quit), then run this again."
    }
}

function Remove-Junction([string]$path) {
    $item = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    if (-not $item) { return }
    if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "$path is a real folder, not the link this script creates. Remove it yourself if it is not needed."
    }
    # Deletes the link only, never the folder it points to.
    [IO.Directory]::Delete($path)
}

if ($Uninstall) {
    Assert-NotRunning
    if (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut }
    Remove-Junction $app
    if (Test-Path -LiteralPath $exe) { Remove-Item -LiteralPath $exe }
    if ((Test-Path -LiteralPath $program) -and -not (Get-ChildItem -LiteralPath $program -Force)) {
        Remove-Item -LiteralPath $program
    }
    Write-Host "Anamnesies was removed from the Start menu. Your data stays in $data."
    return
}

if (-not (Test-Path -LiteralPath (Join-Path $repo "openshell.json"))) {
    throw "openshell.json was not found in $repo."
}

# ---- OpenShell -----------------------------------------------------------------------------------
$desktop = Join-Path $openShellBin "openshell-desktop.exe"
if ($OpenShellDir) {
    foreach ($name in "openshell.exe", "openshell-desktop.exe") {
        if (-not (Test-Path -LiteralPath (Join-Path $OpenShellDir $name))) { throw "$name is missing in $OpenShellDir." }
    }
    Assert-NotRunning
    New-Item -ItemType Directory -Force -Path $openShellBin | Out-Null
    Copy-Item (Join-Path $OpenShellDir "openshell.exe"), (Join-Path $OpenShellDir "openshell-desktop.exe") $openShellBin -Force
} elseif (-not (Test-Path -LiteralPath $desktop)) {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "OpenShell is not installed. Pass -OpenShellDir <folder with openshell-desktop.exe>, or install the GitHub CLI (gh) and sign in."
    }
    $target = "x86_64-pc-windows-msvc"
    $file = "openshell-$target.zip"
    $temp = Join-Path ([IO.Path]::GetTempPath()) ("openshell-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $temp | Out-Null
    try {
        Write-Host "Downloading OpenShell $OpenShellVersion with gh ..."
        & gh release download $OpenShellVersion -R RobinsSuperSchmiede/EDA -p $file -p SHA256SUMS.txt -D $temp
        if ($LASTEXITCODE -ne 0) { throw "gh could not download OpenShell $OpenShellVersion (signed in? gh auth status)." }
        $line = Get-Content (Join-Path $temp "SHA256SUMS.txt") | Where-Object { $_ -match "\s\*?$([regex]::Escape($file))\s*$" } | Select-Object -First 1
        $expected = if ($line) { ($line -split "\s+")[0].ToLower() } else { "" }
        $actual = (Get-FileHash (Join-Path $temp $file) -Algorithm SHA256).Hash.ToLower()
        if (-not $expected -or $expected -ne $actual) { throw "The OpenShell download does not match SHA256SUMS.txt." }
        Expand-Archive -Path (Join-Path $temp $file) -DestinationPath $temp
        New-Item -ItemType Directory -Force -Path $openShellBin | Out-Null
        Copy-Item (Join-Path $temp "openshell-$target\openshell.exe"), (Join-Path $temp "openshell-$target\openshell-desktop.exe") $openShellBin -Force
    } finally {
        Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
    }
}

# ---- Program folder ------------------------------------------------------------------------------
Assert-NotRunning
New-Item -ItemType Directory -Force -Path $program | Out-Null
Copy-Item -LiteralPath $desktop -Destination $exe -Force
Remove-Junction $app
New-Item -ItemType Junction -Path $app -Target $repo | Out-Null

# ---- Start menu ----------------------------------------------------------------------------------
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = $exe
$link.WorkingDirectory = $program
$link.IconLocation = (Join-Path $repo "assets\icon.ico") + ",0"
$link.Description = "Anamnesies - local-first workspace (OpenShell)"
$link.Save()

Write-Host ""
Write-Host "Anamnesies is set up. Find it with the Windows search or in the Start menu."
Write-Host "  program  $program"
Write-Host "  code     $repo"
Write-Host "  data     $data"
Write-Host "The first start installs and builds what is missing and takes a few minutes."

if ($Start) { Start-Process -FilePath $exe -WorkingDirectory $program }

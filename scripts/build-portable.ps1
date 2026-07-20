# Build script for Podcast Notes Assistant (Portable Edition)
# - Preserves portable data directory across rebuilds
# - Kills running app processes before build
# - Copies portable marker into win-unpacked after build
#
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\build-portable.ps1

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$distExe = Join-Path $projectRoot "dist-exe"
$winUnpacked = Join-Path $distExe "win-unpacked"
$dataDir = Join-Path $winUnpacked "data"
$backupDir = Join-Path $distExe "_data_backup"

# Step 1: Kill running app processes
Write-Host "=== Step 1: Checking for running processes ==="
$procs = Get-Process | ForEach-Object {
    try {
        $p = $_
        $pPath = $p.MainModule.FileName
        if ($pPath -like '*Podcast_Notes*' -or $pPath -like '*win-unpacked*') {
            $p
        }
    } catch {}
}
if ($procs) {
    Write-Host "Found $($procs.Count) running processes, stopping..."
    $procs | Stop-Process -Force
    Start-Sleep -Seconds 2
} else {
    Write-Host "No running processes found"
}

# Step 2: Backup portable data directory
Write-Host "`n=== Step 2: Backing up portable data ==="
if (Test-Path $dataDir) {
    if (Test-Path $backupDir) { Remove-Item $backupDir -Recurse -Force }
    Copy-Item $dataDir $backupDir -Recurse
    Write-Host "Data backed up to $backupDir"
} else {
    Write-Host "No data directory to backup (first build)"
}

# Step 3: Build
Write-Host "`n=== Step 3: Building ==="
Push-Location $projectRoot
try {
    & node "node_modules/vite/bin/vite.js" build
    if ($LASTEXITCODE -ne 0) { throw "vite build failed" }

    & node "node_modules/electron-builder/out/cli/cli.js" "--win" "--config.directories.output=dist-exe"
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }
} finally {
    Pop-Location
}

# Step 4: Copy portable marker into win-unpacked
Write-Host "`n=== Step 4: Adding portable marker ==="
$portableSrc = Join-Path $projectRoot "build\portable"
$portableDst = Join-Path $winUnpacked "portable"
if (Test-Path $winUnpacked) {
    Copy-Item $portableSrc $portableDst -Force
    Write-Host "Portable marker copied to $portableDst"
} else {
    Write-Host "WARNING: win-unpacked not found at $winUnpacked"
}

# Step 5: Restore data directory
Write-Host "`n=== Step 5: Restoring portable data ==="
if ((Test-Path $backupDir) -and (Test-Path $winUnpacked)) {
    if (Test-Path $dataDir) { Remove-Item $dataDir -Recurse -Force }
    Copy-Item $backupDir $dataDir -Recurse
    Write-Host "Data restored to $dataDir"
} else {
    Write-Host "No backup to restore"
}

Write-Host "`n=== Done ==="
Write-Host "Portable build: $winUnpacked"
Write-Host "NSIS installer: $distExe\播客笔记助手-Setup-*.exe"

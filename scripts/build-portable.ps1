# Build script for Podcast Notes Assistant
# - Preserves portable data directory across rebuilds
# - Kills running app processes before build

$distExe = "G:\Podcast_Notes\dist-exe"
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

# Step 3: Clean old installer files
Write-Host "`n=== Step 3: Cleaning old installer files ==="
Get-ChildItem $distExe -File | Where-Object { $_.Name -match 'Setup-.*\.exe' -and $_.Name -notmatch $args[0] } | ForEach-Object {
    Write-Host "  Removing: $($_.Name)"
    Remove-Item $_.FullName -Force
}

# Step 4: Build (called externally)
Write-Host "`n=== Step 4: Build will be executed by caller ==="
Write-Host "Backup location: $backupDir"

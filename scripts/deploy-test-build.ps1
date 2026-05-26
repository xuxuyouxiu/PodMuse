$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$buildPathFile = Join-Path $projectRoot '.refresh-test-build-path'

if (!(Test-Path $buildPathFile)) {
  throw "build path marker does not exist: $buildPathFile"
}

$sourceRoot = (Get-Content -LiteralPath $buildPathFile -Raw).Trim()
$sourceDir = Join-Path $sourceRoot 'win-unpacked'
$targetRoot = Join-Path $projectRoot 'dist-exe'
$targetDir = Join-Path $targetRoot 'win-unpacked'

if (!(Test-Path $sourceDir)) {
  throw "temporary build does not exist: $sourceDir"
}

$processNames = @('播客笔记助手.exe', 'electron.exe', 'crashpad_handler.exe')
$targetProcesses = @(Get-CimInstance Win32_Process |
  Where-Object {
    $_.ExecutablePath -and
    $_.ExecutablePath.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
    $processNames -contains $_.Name
  })

foreach ($proc in $targetProcesses) {
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 150
}

$remainingProcesses = @(Get-CimInstance Win32_Process |
  Where-Object {
    $_.ExecutablePath -and
    $_.ExecutablePath.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
    $processNames -contains $_.Name
  })

foreach ($proc in $remainingProcesses) {
  Invoke-CimMethod -InputObject $proc -MethodName Terminate | Out-Null
}

Start-Sleep -Milliseconds 500

if (Test-Path $targetDir) {
  $deleted = $false
  for ($attempt = 0; $attempt -lt 6; $attempt++) {
    try {
      [System.IO.Directory]::Delete($targetDir, $true)
      $deleted = $true
      break
    }
    catch {
      if ($attempt -eq 5) {
        throw
      }
      Start-Sleep -Milliseconds 500
    }
  }

  if (!$deleted -and (Test-Path $targetDir)) {
    throw "failed to clear target directory: $targetDir"
  }
}

if (!(Test-Path $targetRoot)) {
  New-Item -ItemType Directory -Path $targetRoot | Out-Null
}

New-Item -ItemType Directory -Path $targetDir | Out-Null
Copy-Item -Path (Join-Path $sourceDir '*') -Destination $targetDir -Recurse -Force

if (Test-Path $sourceRoot) {
  [System.IO.Directory]::Delete($sourceRoot, $true)
}

if (Test-Path $buildPathFile) {
  Remove-Item -LiteralPath $buildPathFile -Force
}

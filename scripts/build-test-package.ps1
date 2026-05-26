$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$buildPathFile = Join-Path $projectRoot '.refresh-test-build-path'
$tempBase = Join-Path ([System.IO.Path]::GetTempPath()) 'podcast-notes-refresh'
$tempOutput = Join-Path $tempBase ([System.Guid]::NewGuid().ToString('N'))

if (!(Test-Path $tempBase)) {
  New-Item -ItemType Directory -Path $tempBase | Out-Null
}

Push-Location $projectRoot
try {
  & node "node_modules/vite/bin/vite.js" build
  if ($LASTEXITCODE -ne 0) {
    throw "vite build failed with exit code $LASTEXITCODE"
  }

  & node "node_modules/electron-builder/out/cli/cli.js" --win --dir "--config.directories.output=$tempOutput"
  if ($LASTEXITCODE -ne 0) {
    throw "electron-builder dir build failed with exit code $LASTEXITCODE"
  }

  Set-Content -LiteralPath $buildPathFile -Value $tempOutput -Encoding UTF8
}
finally {
  Pop-Location
}

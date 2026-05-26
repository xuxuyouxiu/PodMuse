import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('package.json exposes fixed refresh flow scripts', () => {
  const source = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')

  assert.match(source, /"build:test"\s*:/)
  assert.match(source, /"deploy:test"\s*:/)
  assert.match(source, /"refresh:test"\s*:/)
})

test('build script targets dist-exe-temp unpacked output', () => {
  const source = fs.readFileSync(new URL('../scripts/build-test-package.ps1', import.meta.url), 'utf8')

  assert.match(source, /\.refresh-test-build-path/)
  assert.match(source, /GetTempPath|podcast-notes-refresh/)
  assert.match(source, /--dir/)
})

test('deploy script refreshes dist-exe win-unpacked', () => {
  const source = fs.readFileSync(new URL('../scripts/deploy-test-build.ps1', import.meta.url), 'utf8')

  assert.match(source, /\.refresh-test-build-path/)
  assert.match(source, /dist-exe\\\\win-unpacked|dist-exe\\win-unpacked|Join-Path \$targetRoot 'win-unpacked'/)
  assert.match(source, /Stop-Process|Terminate/)
  assert.match(source, /\[System\.IO\.Directory\]::Delete\(\$sourceRoot,\s*\$true\)/)
  assert.match(source, /for \(\$attempt = 0; \$attempt -lt 6; \$attempt\+\+\)/)
  assert.match(source, /Start-Sleep -Milliseconds 500/)
})

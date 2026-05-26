import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('App defines handleProcess before startup load tasks uses it', () => {
  const source = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')
  const handleProcessIndex = source.indexOf('const handleProcess = useCallback')
  const startupEffectIndex = source.indexOf('window.electronAPI.getTasks()')

  assert.notEqual(handleProcessIndex, -1)
  assert.notEqual(startupEffectIndex, -1)
  assert.ok(
    startupEffectIndex < handleProcessIndex,
    'startup getTasks should happen before handleProcess',
  )
})

test('App startup no longer auto resumes incomplete task immediately', () => {
  const source = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')
  const startupSlice = source.slice(
    source.indexOf('window.electronAPI.getTasks()'),
    source.indexOf('const handleCancel = useCallback'),
  )

  assert.equal(startupSlice.includes('handleProcess(task.url)'), false)
  assert.equal(startupSlice.includes('handleProcess(latestPending.url)'), false)
})

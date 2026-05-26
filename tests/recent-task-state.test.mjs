import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'

const SRC = 'src/main/recent-task-state.ts'

function readSource() {
  return fs.readFileSync(SRC, 'utf-8')
}

test('completed recent task should not auto resume after app restart', () => {
  const src = readSource()
  assert.match(src, /completeRecentTask/)
  assert.match(src, /completed/)
  assert.match(src, /processedUrls/)
})

test('stopped recent task should stay in sidebar instead of auto resuming after app restart', () => {
  const src = readSource()
  assert.match(src, /stopRecentTask/)
  assert.match(src, /'stopped'/)
})

test('task without episode id stays resumable by url until completed', () => {
  const src = readSource()
  assert.match(src, /shouldAutoResumeRecentTask/)
  assert.match(src, /episodeId/)
})

test('recent tasks keeps only latest five records', () => {
  const src = readSource()
  assert.match(src, /MAX_RECENT_TASKS/)
  assert.match(src, /MAX_RECENT_TASKS\s*=\s*5/)
})

test('removeRecentTask deletes a task record by id', () => {
  const src = readSource()
  assert.match(src, /export function removeRecentTask/)
})

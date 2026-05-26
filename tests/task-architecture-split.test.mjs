import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('FeishuState includes activeTasks array', () => {
  const source = fs.readFileSync(new URL('../src/shared/types.ts', import.meta.url), 'utf8')
  assert.match(source, /activeTasks:\s*RecentTaskState\[\]/)
})

test('loadState initializes activeTasks', () => {
  const source = fs.readFileSync(new URL('../src/main/config.ts', import.meta.url), 'utf8')
  assert.match(source, /activeTasks:\s*data\.activeTasks\s*\|\|\s*\[\]/)
})

test('message poller catches listMessages errors and logs fallback message', () => {
  const source = fs.readFileSync(new URL('../src/main/message-poller.ts', import.meta.url), 'utf8')
  assert.match(source, /try\s*\{\s*messages\s*=\s*await\s*this\.client\.listMessages/)
  assert.match(source, /catch\s*\([^)]*\)\s*\{\s*this\.logFunc\('⚠️ 飞书任务同步失败，正在使用本地缓存'\)/)
})
test('task state functions migrate tasks between active and recent lists', () => {
  const source = fs.readFileSync(new URL('../src/main/recent-task-state.ts', import.meta.url), 'utf8')
  
  assert.match(source, /activeTasks:\s*normalizeRecentTasks\(\[\s*nextTask/)
  
  assert.match(source, /activeTasks:\s*state\.activeTasks\.filter/)
  assert.match(source, /recentTasks:\s*normalizeRecentTasks\(\[\s*\{\s*\.\.\.activeTask,\s*status:\s*'completed'/)
})
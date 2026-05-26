import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('IPC handlers expose getTasks object with both lists', () => {
  const source = fs.readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  assert.match(source, /ipcMain\.handle\('task:getAll',/)
  assert.match(source, /activeTasks:[\s\S]*recentTasks:/)
})

test('Renderer env declares getTasks', () => {
  const source = fs.readFileSync(new URL('../src/renderer/env.d.ts', import.meta.url), 'utf8')
  assert.match(source, /getTasks:\s*\(\)\s*=>\s*Promise<\{/)
})

test('New panel components exist and use correct titles', () => {
  const activeSource = fs.readFileSync(new URL('../src/renderer/components/ActiveTasksPanel.tsx', import.meta.url), 'utf8')
  const recentSource = fs.readFileSync(new URL('../src/renderer/components/RecentTasksPanel.tsx', import.meta.url), 'utf8')
  
  assert.match(activeSource, /活跃任务/)
  assert.match(recentSource, /历史记录/)
})

test('App renders both ActiveTasksPanel and RecentTasksPanel', () => {
  const source = fs.readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')
  assert.match(source, /<ActiveTasksPanel/)
  assert.match(source, /<RecentTasksPanel/)
  assert.match(source, /const \[activeTasks,\s*setActiveTasks\]/)
})
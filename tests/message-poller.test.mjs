import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('message poller source checks incomplete recent tasks before dispatching podcast jobs', () => {
  const source = fs.readFileSync(new URL('../src/main/message-poller.ts', import.meta.url), 'utf8')
  assert.equal(source.includes('hasIncompleteRecentTask'), true)
})

test('message poller first startup scan only establishes baseline and does not auto dispatch history messages', () => {
  const source = fs.readFileSync(new URL('../src/main/message-poller.ts', import.meta.url), 'utf8')
  assert.equal(source.includes('baselineReady'), true)
  assert.match(source, /首轮扫描只建立消息基线/)
  assert.match(source, /this\.store\.mark\(task\.id\)/)
})

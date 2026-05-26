import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('processed message store source preserves current state when flushing ids', () => {
  const source = fs.readFileSync(new URL('../src/main/processed-message-store.ts', import.meta.url), 'utf8')
  assert.equal(source.includes('const currentState = loadState()'), true)
  assert.equal(source.includes('...currentState'), true)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const SRC = 'src/main/whisper-progress.ts'

function readSource() {
  return fs.readFileSync(SRC, 'utf-8')
}

test('parseWhisperPercent extracts numeric progress from whisper output', () => {
  const src = readSource()
  assert.match(src, /export function parseWhisperPercent/)
  assert.match(src, /matchAll/)
  assert.match(src, /%\/g/)
})

test('isWhisperTranscriptActivity detects timestamped transcript lines without percent', () => {
  const src = readSource()
  assert.match(src, /isWhisperTranscriptActivity/)
  assert.match(src, /-->/)
})

test('estimateWhisperProgress advances during transcribing without jumping to completion', () => {
  const src = readSource()
  assert.match(src, /estimateWhisperProgress/)
  assert.match(src, /elapsedMs/)
})

test('formatWhisperProgress no longer shows estimated wording during transcribing', () => {
  const src = readSource()
  assert.match(src, /formatWhisperProgress/)
  assert.match(src, /estimated/)
})

test('formatWhisperProgress marks real progress clearly', () => {
  const src = readSource()
  assert.match(src, /real/)
})

test('podcast step 3 should not prefill whisper progress before real progress starts', () => {
  const source = fs.readFileSync(new URL('../src/main/podcast.ts', import.meta.url), 'utf8')
  const step3InitIndex = source.indexOf("step({ step: 3, title: '语音转文字'")
  const transcriptCallIndex = source.indexOf('const transcript = await runWhisper(')
  const step3InitSlice = source.slice(step3InitIndex, transcriptCallIndex)

  assert.notEqual(step3InitIndex, -1)
  assert.doesNotMatch(step3InitSlice, /估算/)
  assert.doesNotMatch(step3InitSlice, /progress:\s*\d+/)
})

test('step panel should not use fixed 80px node width anymore', () => {
  const source = fs.readFileSync(new URL('../src/renderer/components/StepPanel.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /width:\s*80/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'

const SRC = 'src/main/whisper-model-manager.ts'

function readSource() { return fs.readFileSync(SRC, 'utf-8') }

test('scanLocalModels exists', () => {
  const src = readSource()
  assert.match(src, /export function scanLocalModels/)
})

test('checkHardware exists', () => {
  const src = readSource()
  assert.match(src, /export function checkHardware/)
})

test('getStandardModels returns model list', () => {
  const src = readSource()
  assert.match(src, /tiny/)
  assert.match(src, /base/)
  assert.match(src, /small/)
  assert.match(src, /medium/)
  assert.match(src, /large-v3-turbo/)
})

test('checkHardware returns ram requirement', () => {
  const src = readSource()
  assert.match(src, /ramMinGB/)
  assert.match(src, /totalRamGB/)
})

test('PodcastConfig has whisper_model field', () => {
  const src = fs.readFileSync('src/shared/types.ts', 'utf-8')
  assert.match(src, /whisper_model/)
})

test('whisper.ts no longer has hardcoded model', () => {
  const src = fs.readFileSync('src/main/whisper.ts', 'utf-8')
  assert.doesNotMatch(src, /WHISPER_MODEL\s*=\s*'large-v3-turbo'/)
})

test('config defaults include whisper_model', () => {
  const src = fs.readFileSync('src/main/config.ts', 'utf-8')
  assert.match(src, /whisper_model.*large-v3-turbo/)
})

test('SettingsDialog includes model selection UI', () => {
  const src = fs.readFileSync('src/renderer/components/SettingsDialog.tsx', 'utf-8')
  assert.match(src, /whisper_model/)
  assert.match(src, /handleModelChange/)
  assert.match(src, /scanWhisperModels/)
})

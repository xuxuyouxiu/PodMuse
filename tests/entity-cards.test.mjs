import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const SRC = 'src/main/entity-cards.ts'

function readSource() { return fs.readFileSync(SRC, 'utf-8') }

test('parseEntityBlocks exists', () => {
  const src = readSource()
  assert.match(src, /export function parseEntityBlocks/)
})

test('parseEntityBlocks extracts people entities', () => {
  const src = readSource()
  assert.match(src, /'PEOPLE'/)
  assert.match(src, /姓名/)
})

test('parseEntityBlocks extracts project entities', () => {
  const src = readSource()
  assert.match(src, /'PROJECT'/)
  assert.match(src, /项目名称/)
})

test('parseEntityBlocks extracts concept entities', () => {
  const src = readSource()
  assert.match(src, /'CONCEPT'/)
  assert.match(src, /概念名称/)
})

test('writeEntityNotes exists', () => {
  const src = readSource()
  assert.match(src, /export function writeEntityNotes/)
})

test('writeEntityNotes creates files in correct directories', () => {
  const src = readSource()
  assert.match(src, /人物/)
  assert.match(src, /项目/)
  assert.match(src, /概念/)
})

test('writeEntityNotes appends source on duplicate', () => {
  const src = readSource()
  assert.match(src, /appendSourceLink/)
  assert.match(src, /existsSync/)
})

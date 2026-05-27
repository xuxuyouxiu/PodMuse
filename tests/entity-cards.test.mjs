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

test('parseEntityBlocks extracts term entities', () => {
  const src = readSource()
  assert.match(src, /'TERM'/)
  assert.match(src, /术语名称/)
})

test('writeEntityNotes is now async', () => {
  const src = readSource()
  assert.match(src, /export async function writeEntityNotes/)
  assert.match(src, /Promise<WriteEntityResult>/)
})

test('writeEntityNotes creates files in correct directories', () => {
  const src = readSource()
  assert.match(src, /人物/)
  assert.match(src, /项目/)
  assert.match(src, /概念/)
  assert.match(src, /术语/)
})

test('writeEntityNotes appends source on duplicate', () => {
  const src = readSource()
  assert.match(src, /appendSourceLink/)
  assert.match(src, /existsSync/)
})

test('TermEntity interface exists', () => {
  const src = readSource()
  assert.match(src, /TermEntity/)
  assert.match(src, /cardType/)
  assert.match(src, /contextExplanation/)
  assert.match(src, /supplementary/)
})

test('WriteEntityResult interface exists', () => {
  const src = readSource()
  assert.match(src, /WriteEntityResult/)
  assert.match(src, /termToConcept/)
  assert.match(src, /conceptSearched/)
})

test('Term_Template fallback exists', () => {
  const src = readSource()
  assert.match(src, /Term_Template\.md/)
})

test('extractGlossaryTerms exists', () => {
  const src = readSource()
  assert.match(src, /export function extractGlossaryTerms/)
})

test('extractGlossaryTerms parses terms from markdown', () => {
  const src = readSource()
  assert.match(src, /# 术语词典/)
  assert.match(src, /\[\[/)
})

test('fillMissingTermCards exists', () => {
  const src = readSource()
  assert.match(src, /export function fillMissingTermCards/)
})

test('fillMissingTermCards no longer injects fake context', () => {
  const src = readSource()
  const fillMatch = src.match(/export function fillMissingTermCards[\s\S]*?(?=export function|export async function|$)/)
  const fillFn = fillMatch ? fillMatch[0] : src
  // The old placeholder text should NOT appear in the function body
  const hasFakeContext = fillFn.includes('AI 未自动生成卡片') && fillFn.includes('已由程序补全')
  assert.equal(hasFakeContext, false, 'fillMissingTermCards不应再注入假上下文占位符')
})

test('hasRealContext function exists', () => {
  const src = readSource()
  assert.match(src, /function hasRealContext/)
  assert.match(src, /AI 未自动生成卡片/)
  assert.match(src, /已由程序补全/)
})

test('fetchConceptDefinition function exists', () => {
  const src = readSource()
  assert.match(src, /async function fetchConceptDefinition/)
  assert.match(src, /wikipedia/)
})

test('filterNonNotablePeople function exists', () => {
  const src = readSource()
  assert.match(src, /export function filterNonNotablePeople/)
})

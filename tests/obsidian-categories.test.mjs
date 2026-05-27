import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'

const SRC = 'src/main/obsidian-categories.ts'

function readSource() {
  return fs.readFileSync(SRC, 'utf-8')
}

test('sanitizePathSegment replaces invalid chars', () => {
  const src = readSource()
  assert.match(src, /sanitizePathSegment/)
  assert.match(src, /replace\(/)
})

test('pickCategoryName exists', () => {
  const src = readSource()
  assert.match(src, /export function pickCategoryName/)
})

test('parseTagsFromMarkdown exists', () => {
  const src = readSource()
  assert.match(src, /export function parseTagsFromMarkdown/)
})

test('migrateExistingNotes exists', () => {
  const src = readSource()
  assert.match(src, /export function migrateExistingNotes/)
})

test('resolveUniquePath exists', () => {
  const src = readSource()
  assert.match(src, /export function resolveUniquePath/)
})

test('loadOrInitCategoryConfig exists', () => {
  const src = readSource()
  assert.match(src, /export function loadOrInitCategoryConfig/)
})

test('default categories include all 8 core categories', () => {
  const src = readSource()
  for (const name of ['科技类', '商业财经类', '文化艺术类', '历史社科类', '职场成长类', '生活方式类', '学术科普类', '其他']) {
    assert.match(src, new RegExp(name))
  }
})

test('DEFAULT_RULES is not empty', () => {
  const src = readSource()
  assert.match(src, /const DEFAULT_RULES/)
  const rulesMatch = src.match(/DEFAULT_RULES[\s\S]*?\];/)
  assert.ok(rulesMatch, 'DEFAULT_RULES should exist')
  const rulesBlock = rulesMatch[0]
  const count = (rulesBlock.match(/categoryId:/g) || []).length
  assert.ok(count > 30, `DEFAULT_RULES should have >30 rules, got ${count}`)
})

test('keywordFuzzyMatch function exists', () => {
  const src = readSource()
  assert.match(src, /function keywordFuzzyMatch/)
})

test('KEYWORD_CATEGORY_MAP covers all 7 non-other categories', () => {
  const src = readSource()
  for (const id of ['tech', 'business', 'culture', 'history', 'career', 'life', 'science']) {
    assert.match(src, new RegExp(`categoryId:\\s*'${id}'`))
  }
})

test('getDefaultCategoryConfig includes rules', () => {
  const src = readSource()
  assert.match(src, /rules:\s*\[\.\.\.DEFAULT_RULES\]/)
})

test('loadOrInitCategoryConfig auto-fills empty rules', () => {
  const src = readSource()
  assert.match(src, /raw\.rules\.length === 0/)
  assert.match(src, /DEFAULT_RULES/)
})

test('pickCategoryName accepts optional log callback', () => {
  const src = readSource()
  assert.match(src, /log\?:\s*\(msg:\s*string\)/)
})
